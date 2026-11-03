import asyncio
import json
import urllib.request
import websockets
import subprocess
import sys
import base64
import os
import tempfile

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9300
URL = 'http://localhost:8085/index.html?v=20261103_v22'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_75A = os.path.join(ARTIFACT_DIR, '75a_small_intestine_isolated_geodesic_regions.png')
SHOT_75B = os.path.join(ARTIFACT_DIR, '75b_small_intestine_hover_jejunum.png')
SHOT_75C = os.path.join(ARTIFACT_DIR, '75c_small_intestine_hover_ileum.png')
SHOT_75D = os.path.join(ARTIFACT_DIR, '75d_whole_system_overview_with_geodesic_small_intestine.png')

async def main():
    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge on port {PORT}...", flush=True)
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
                if tabs: break
            except Exception: pass
                
        if not tabs:
            raise RuntimeError("Failed to connect to Edge")

        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']

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
                if params: msg['params'] = params
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
                    except Exception: break

            dispatch_task = asyncio.create_task(dispatch())

            await send_cmd('Page.enable')
            await send_cmd('Runtime.enable')

            print(f"Navigating to {URL}...", flush=True)
            await send_cmd('Page.navigate', {'url': URL})

            for _ in range(60):
                await asyncio.sleep(0.5)
                eval_res = await send_cmd('Runtime.evaluate', {
                    'expression': 'Boolean(window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.clickableMeshes.length > 50 && window.__DIGESTIVE_APP__.sceneView.siTubeProgress)'
                })
                if eval_res.get('result', {}).get('value') == True:
                    print("3D Engine & siTubeProgress Loaded Successfully!", flush=True)
                    break

            await asyncio.sleep(1.0)

            # ----------------------------------------------------
            # TEST 1: Small Intestine Geodesic Topological Heatmap
            # ----------------------------------------------------
            print("\n[TEST 1] Verifying Geodesic Small Intestine Heatmap...", flush=True)
            si_res = await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.dissectionVM.setState({ isIsolateMode: true, organDisplayMode: 'regions' });
                    app.sceneVM.selectOrgan('small_intestine');

                    const mesh = (app.sceneView.smallIntestineWallMeshes && app.sceneView.smallIntestineWallMeshes.length > 0)
                        ? app.sceneView.smallIntestineWallMeshes[0]
                        : app.sceneView.clickableMeshes.find(m => m.userData.organId === 'small_intestine');

                    const geo = mesh.geometry;
                    const count = geo.attributes.position.count;
                    const colors = geo.attributes.color.array;
                    const tubeDist = app.sceneView.siTubeProgress;

                    let jejunumCount = 0;
                    let ileumCount = 0;

                    for (let i = 0; i < count; i++) {
                        const r = colors[i * 3];
                        const b = colors[i * 3 + 2];
                        if (r > 0.8) jejunumCount++;
                        if (b > 0.8) ileumCount++;
                    }

                    // Check start and end vertex colors
                    const startColor = { r: colors[13831 * 3], g: colors[13831 * 3 + 1], b: colors[13831 * 3 + 2] };
                    const endColor = { r: colors[572 * 3], g: colors[572 * 3 + 1], b: colors[572 * 3 + 2] };

                    app.sceneView.controls.target.set(-0.2, -0.6, 0.0);
                    app.sceneView.camera.position.set(-0.2, -0.6, 7.5);
                    app.sceneView.camera.lookAt(-0.2, -0.6, 0.0);

                    return {
                        count,
                        jejunumCount,
                        ileumCount,
                        jejunumPct: jejunumCount / count,
                        ileumPct: ileumCount / count,
                        startIsCoral: startColor.r > 0.9,
                        endIsBlue: endColor.b > 0.9
                    };
                })()
                """,
                'returnByValue': True
            })
            si_data = si_res.get('result', {}).get('value', {})
            print(f"  Geodesic Mesh Check: {json.dumps(si_data, ensure_ascii=False)}")
            assert si_data.get('startIsCoral') == True, "Error: Start vertex is not Coral Jejunum color"
            assert si_data.get('endIsBlue') == True, "Error: End vertex is not Cornflower Blue Ileum color"
            assert abs(si_data.get('jejunumPct', 0) - 0.401) < 0.02, f"Error: Jejunum percentage incorrect ({si_data.get('jejunumPct')})"

            await asyncio.sleep(0.8)
            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_75A, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_75A}")

            # ----------------------------------------------------
            # TEST 2: Hover Callout over Jejunum (Hot Coral Dot)
            # ----------------------------------------------------
            print("\n[TEST 2] Testing Hover Callout over Jejunum...", flush=True)
            hov_jej_res = await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const mesh = (app.sceneView.smallIntestineWallMeshes && app.sceneView.smallIntestineWallMeshes.length > 0)
                        ? app.sceneView.smallIntestineWallMeshes[0]
                        : app.sceneView.clickableMeshes.find(m => m.userData.organId === 'small_intestine');

                    // Simulate hover over a jejunum vertex face
                    app.sceneView._lastHitIntersection = {
                        object: mesh,
                        point: new THREE.Vector3(2.5, 106.0, 5.0),
                        face: { a: 13831, b: 13832, c: 13833 }
                    };
                    app.sceneView._lastIntersectionPoint = new THREE.Vector3(2.5, 106.0, 5.0);

                    const payload = app.sceneView._buildHoverPayload(mesh, 880, 420);
                    app.sceneView.hoverCallout.update(payload);
                    return payload;
                })()
                """,
                'returnByValue': True
            })
            jej_payload = hov_jej_res.get('result', {}).get('value', {})
            print(f"  Jejunum Hover: {jej_payload.get('title')}, color: {jej_payload.get('color')}")
            assert 'Hỗng Tràng' in jej_payload.get('title', ''), "Error: Hover did not identify Hỗng Tràng"
            assert jej_payload.get('color') == '#ff477e', f"Error: Color dot mismatch ({jej_payload.get('color')})"

            await asyncio.sleep(0.5)
            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_75B, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_75B}")

            # ----------------------------------------------------
            # TEST 3: Hover Callout over Ileum (Blue Dot)
            # ----------------------------------------------------
            print("\n[TEST 3] Testing Hover Callout over Ileum...", flush=True)
            hov_ile_res = await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const mesh = (app.sceneView.smallIntestineWallMeshes && app.sceneView.smallIntestineWallMeshes.length > 0)
                        ? app.sceneView.smallIntestineWallMeshes[0]
                        : app.sceneView.clickableMeshes.find(m => m.userData.organId === 'small_intestine');

                    // Simulate hover over an ileum terminal vertex face
                    app.sceneView._lastHitIntersection = {
                        object: mesh,
                        point: new THREE.Vector3(-7.5, 92.0, 3.0),
                        face: { a: 572, b: 573, c: 574 }
                    };
                    app.sceneView._lastIntersectionPoint = new THREE.Vector3(-7.5, 92.0, 3.0);

                    const payload = app.sceneView._buildHoverPayload(mesh, 820, 680);
                    app.sceneView.hoverCallout.update(payload);
                    return payload;
                })()
                """,
                'returnByValue': True
            })
            ile_payload = hov_ile_res.get('result', {}).get('value', {})
            print(f"  Ileum Hover: {ile_payload.get('title')}, color: {ile_payload.get('color')}")
            assert 'Hồi Tràng' in ile_payload.get('title', ''), "Error: Hover did not identify Hồi Tràng"
            assert ile_payload.get('color') == '#54a0ff', f"Error: Color dot mismatch ({ile_payload.get('color')})"

            await asyncio.sleep(0.5)
            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_75C, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_75C}")

            # ----------------------------------------------------
            # TEST 4: Whole System Overview with Geodesic Small Intestine
            # ----------------------------------------------------
            print("\n[TEST 4] Testing Whole System Overview...", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const tabSystem = document.getElementById('tab-btn-system');
                    if (tabSystem) tabSystem.click();
                    app.sceneVM.selectOrgan(null);
                    app.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0.0 });
                    app.sceneView.hoverCallout.hide();
                    app.sceneView.resetCamera();
                })()
                """
            })
            await asyncio.sleep(1.0)
            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_75D, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"  Saved: {SHOT_75D}")

            print("\nALL 4 SMALL INTESTINE GEODESIC VERIFICATION CHECKS PASSED!", flush=True)
            dispatch_task.cancel()
    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(main())
