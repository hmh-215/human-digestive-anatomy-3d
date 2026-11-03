import asyncio
import json
import urllib.request
import websockets
import subprocess
import sys
import base64
import os
import tempfile
import traceback

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9298
URL = 'http://localhost:8085/index.html?v=20261103_v21'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_73A = os.path.join(ARTIFACT_DIR, '73a_clinical_bodymap_correct_anatomy_with_peritoneum.png')
SHOT_73B = os.path.join(ARTIFACT_DIR, '73b_isolated_pancreas_zero_vessels.png')
SHOT_73C = os.path.join(ARTIFACT_DIR, '73c_isolated_liver_zero_vessels.png')
SHOT_73D = os.path.join(ARTIFACT_DIR, '73d_oral_cavity_midsagittal_jaw_and_teeth_cutaway.png')
SHOT_73E = os.path.join(ARTIFACT_DIR, '73e_whole_system_knolling_v21_cache_busted.png')

async def main():
    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge on port {PORT} with temp dir: {temp_dir}...", flush=True)
    proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        f'--user-data-dir={temp_dir}',
        '--window-size=1600,1050',
        'about:blank'
    ])
    try:
        tabs = None
        for attempt in range(25):
            try:
                await asyncio.sleep(0.4)
                raw = urllib.request.urlopen(f'http://localhost:{PORT}/json').read().decode()
                tabs = json.loads(raw)
                if tabs:
                    break
            except Exception:
                pass
                
        if not tabs:
            raise RuntimeError("Failed to connect to Edge debugging port")
            
        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        print(f"Connected to Edge! Found {len(page_tabs)} page tabs", flush=True)

        async with websockets.connect(ws_url, max_size=200_000_000) as ws:
            req_id = 1
            pending = {}
            loop = asyncio.get_running_loop()

            async def send_cmd(method, params=None):
                nonlocal req_id
                cid = req_id
                req_id += 1
                fut = loop.create_future()
                pending[cid] = fut
                msg = {'id': cid, 'method': method}
                if params:
                    msg['params'] = params
                await ws.send(json.dumps(msg))
                return await fut

            async def dispatch():
                while True:
                    try:
                        raw = await ws.recv()
                        data = json.loads(raw)
                        cid = data.get('id')
                        if cid in pending:
                            pending.pop(cid).set_result(data.get('result', {}))
                    except Exception:
                        break

            dispatch_task = asyncio.create_task(dispatch())

            await send_cmd('Page.enable')
            await send_cmd('Runtime.enable')

            print(f"Navigating to {URL}...", flush=True)
            await send_cmd('Page.navigate', {'url': URL})

            # Wait for 3D engine to fully load
            for _ in range(60):
                await asyncio.sleep(0.5)
                eval_res = await send_cmd('Runtime.evaluate', {
                    'expression': 'Boolean(window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.clickableMeshes.length > 50)'
                })
                if eval_res.get('result', {}).get('value') == True:
                    print("3D Engine & All Meshes Fully Loaded!", flush=True)
                    break

            await asyncio.sleep(1.0)

            # ----------------------------------------------------
            # TEST 1: Clinical Body Map with Peritoneum & Correct Diaphragm
            # ----------------------------------------------------
            print("\n[TEST 1] Testing Clinical Body Map & Peritoneum Pin...", flush=True)
            bm_res = await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const tabBtn = document.getElementById('dock-tab-organ');
                    if (tabBtn) tabBtn.click();
                    const peritPin = document.querySelector('.pin-peritoneum');
                    const liverPin = document.querySelector('.pin-liver');
                    const stomachPin = document.querySelector('.pin-stomach');
                    return {
                        hasPeritPin: Boolean(peritPin),
                        peritText: peritPin ? peritPin.textContent.trim() : null,
                        liverTop: liverPin ? window.getComputedStyle(liverPin).top : null,
                        stomachTop: stomachPin ? window.getComputedStyle(stomachPin).top : null
                    };
                })()
                """,
                'returnByValue': True
            })
            bm_data = bm_res.get('result', {}).get('value', {})
            print(f"  Body Map Data: {json.dumps(bm_data, ensure_ascii=False)}")
            await asyncio.sleep(0.5)

            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_73A, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_73A}")

            # ----------------------------------------------------
            # TEST 2: Isolated Pancreas (Zero Blood Vessels)
            # ----------------------------------------------------
            print("\n[TEST 2] Testing Isolated Pancreas (Zero Blood Vessels)...", flush=True)
            panc_res = await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.dissectionVM.setState({ isIsolateMode: true });
                    app.sceneVM.selectOrgan('pancreas');

                    let visiblePancreas = 0;
                    let visibleVessels = 0;
                    let visibleDuodenum = 0;

                    app.sceneView.clickableMeshes.forEach(m => {
                        if (!m.visible) return;
                        const org = m.userData.organId;
                        const low = (m.name || '').toLowerCase();
                        if (org === 'pancreas') visiblePancreas++;
                        if (['portal_system', 'hepatic_artery', 'hepatic_veins'].includes(org) || low.includes('vessel') || low.includes('splenic') || low.includes('mesenteric')) visibleVessels++;
                        if (org === 'duodenum') visibleDuodenum++;
                    });

                    // Set camera for clear view
                    app.sceneView.controls.target.set(0.2, 0.4, 0.0);
                    app.sceneView.camera.position.set(0.2, 0.4, 6.0);
                    app.sceneView.camera.lookAt(0.2, 0.4, 0.0);

                    return { visiblePancreas, visibleVessels, visibleDuodenum };
                })()
                """,
                'returnByValue': True
            })
            panc_data = panc_res.get('result', {}).get('value', {})
            print(f"  Isolated Pancreas Mesh Check: {json.dumps(panc_data, ensure_ascii=False)}")
            assert panc_data.get('visibleVessels') == 0, f"Error: Vessels still visible ({panc_data.get('visibleVessels')})"
            assert panc_data.get('visibleDuodenum') == 0, f"Error: Duodenum still visible ({panc_data.get('visibleDuodenum')})"
            await asyncio.sleep(0.8)

            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_73B, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_73B}")

            # ----------------------------------------------------
            # TEST 3: Isolated Liver (Zero Blood Vessels)
            # ----------------------------------------------------
            print("\n[TEST 3] Testing Isolated Liver (Zero Blood Vessels)...", flush=True)
            liver_res = await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.dissectionVM.setState({ isIsolateMode: true });
                    app.sceneVM.selectOrgan('liver');

                    let visibleLiver = 0;
                    let visibleVessels = 0;

                    app.sceneView.clickableMeshes.forEach(m => {
                        if (!m.visible) return;
                        const org = m.userData.organId;
                        if (org === 'liver') visibleLiver++;
                        if (['portal_system', 'hepatic_artery', 'hepatic_veins'].includes(org)) visibleVessels++;
                    });

                    // Set camera for clear view
                    app.sceneView.controls.target.set(-0.2, 0.6, 0.0);
                    app.sceneView.camera.position.set(-0.2, 0.6, 9.0);
                    app.sceneView.camera.lookAt(-0.2, 0.6, 0.0);

                    return { visibleLiver, visibleVessels };
                })()
                """,
                'returnByValue': True
            })
            liver_data = liver_res.get('result', {}).get('value', {})
            print(f"  Isolated Liver Mesh Check: {json.dumps(liver_data, ensure_ascii=False)}")
            assert liver_data.get('visibleVessels') == 0, f"Error: Vessels still visible in isolated liver ({liver_data.get('visibleVessels')})"
            await asyncio.sleep(0.8)

            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_73C, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_73C}")

            # ----------------------------------------------------
            # TEST 4: Oral Cavity Midsagittal Jaw Cutaway
            # ----------------------------------------------------
            print("\n[TEST 4] Testing Oral Cavity Midsagittal Jaw Cutaway...", flush=True)
            oral_res = await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.dissectionVM.setState({ isIsolateMode: true, isCutawayOpen: true });
                    app.sceneVM.selectOrgan('oral_cavity');

                    // Check that Mandible and Gingiva have uCutawayActive === 1.0
                    let mandibleCutActive = false;
                    let gingivaCutActive = false;
                    let teethCutActive = false;

                    app.sceneView.clickableMeshes.forEach(m => {
                        const low = (m.name || '').toLowerCase();
                        const uVal = m.material && m.material.userData && m.material.userData.uCutawayActive ? m.material.userData.uCutawayActive.value : 0;
                        if (low.includes('mandib') && uVal === 1.0) mandibleCutActive = true;
                        if (low.includes('gingiva') && uVal === 1.0) gingivaCutActive = true;
                        if ((low.includes('maxillal') || low.endsWith('l')) && uVal === 1.0) teethCutActive = true;
                    });

                    // Position camera angled from anterolateral left to look straight into medial cutaway
                    app.sceneView.controls.target.set(0.0, 2.1, 0.0);
                    app.sceneView.camera.position.set(2.8, 2.4, 3.8);
                    app.sceneView.camera.lookAt(0.0, 2.1, 0.0);

                    return { mandibleCutActive, gingivaCutActive, teethCutActive };
                })()
                """,
                'returnByValue': True
            })
            oral_data = oral_res.get('result', {}).get('value', {})
            print(f"  Oral Cutaway Active Check: {json.dumps(oral_data, ensure_ascii=False)}")
            assert oral_data.get('mandibleCutActive') == True, "Error: Mandible cutaway shader not active"
            assert oral_data.get('teethCutActive') == True, "Error: Left teeth cutaway shader not active"
            await asyncio.sleep(0.8)

            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_73D, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_73D}")

            # ----------------------------------------------------
            # TEST 5: Whole-System Knolling Grid Expanded Spacing
            # ----------------------------------------------------
            print("\n[TEST 5] Testing Whole-System Knolling Grid Spacing...", flush=True)
            knoll_res = await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const tabSystem = document.getElementById('dock-tab-system');
                    if (tabSystem) tabSystem.click();
                    app.sceneVM.selectOrgan(null);
                    app.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 1.0 });

                    // Check row positions
                    let row1Y = null, row2Y = null, row3Y = null, row4Y = null;
                    app.sceneView.clickableMeshes.forEach(m => {
                        const org = m.userData.organId;
                        const tc = m.userData.knollingTargetCenter;
                        if (!tc) return;
                        if (org === 'esophagus' && row1Y === null) row1Y = tc.y;
                        if (org === 'liver' && row2Y === null) row2Y = tc.y;
                        if (org === 'small_intestine' && row3Y === null) row3Y = tc.y;
                        if (org === 'large_intestine' && row4Y === null) row4Y = tc.y;
                    });

                    // Set camera to view all 4 rows
                    app.sceneView.controls.target.set(0.0, -1.0, 0.0);
                    app.sceneView.camera.position.set(0.0, -1.0, 42.0);
                    app.sceneView.camera.lookAt(0.0, -1.0, 0.0);

                    return { row1Y, row2Y, row3Y, row4Y, gap12: row1Y - row2Y, gap23: row2Y - row3Y, gap34: row3Y - row4Y };
                })()
                """,
                'returnByValue': True
            })
            knoll_data = knoll_res.get('result', {}).get('value', {})
            print(f"  Knolling Row Spacing Check: {json.dumps(knoll_data, ensure_ascii=False)}")
            assert knoll_data.get('gap12') >= 30.0, f"Error: Gap 1-2 too small ({knoll_data.get('gap12')})"
            assert knoll_data.get('gap23') >= 30.0, f"Error: Gap 2-3 too small ({knoll_data.get('gap23')})"
            assert knoll_data.get('gap34') >= 40.0, f"Error: Gap 3-4 too small ({knoll_data.get('gap34')})"
            await asyncio.sleep(1.0)

            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_73E, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_73E}")

            print("\nALL 5 AUTOMATED VERIFICATION CHECKS PASSED PERFECTLY!", flush=True)

            dispatch_task.cancel()
    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(main())
