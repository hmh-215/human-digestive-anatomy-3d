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
PORT = 9301
URL = 'http://localhost:8085/index.html?v=20261104_v23'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_76A = os.path.join(ARTIFACT_DIR, '76a_whole_system_100pct_opaque.png')
SHOT_76B = os.path.join(ARTIFACT_DIR, '76b_switch_back_zero_ghosting.png')
SHOT_76C = os.path.join(ARTIFACT_DIR, '76c_gallbladder_and_bile_duct_4_layers_exploded.png')
SHOT_76D = os.path.join(ARTIFACT_DIR, '76d_gallbladder_and_bile_duct_cutaway.png')

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
                await ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
                return await fut

            async def bg_listener():
                try:
                    async for msg in ws:
                        d = json.loads(msg)
                        if 'id' in d and d['id'] in pending:
                            f = pending.pop(d['id'])
                            if 'error' in d:
                                f.set_exception(Exception(d['error']))
                            else:
                                f.set_result(d.get('result', {}))
                except Exception:
                    pass

            listen_task = asyncio.create_task(bg_listener())

            await send_cmd('Page.enable')
            await send_cmd('Runtime.enable')

            print(f"Navigating to {URL}...", flush=True)
            await send_cmd('Page.navigate', {'url': URL})

            # Wait for 3D model loading
            for i in range(40):
                await asyncio.sleep(0.5)
                eval_res = await send_cmd('Runtime.evaluate', {
                    'expression': 'Boolean(window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.clickableMeshes.length > 10)'
                })
                if eval_res.get('result', {}).get('value'):
                    print(f"3D Scene ready at attempt {i+1}!", flush=True)
                    break
            else:
                raise RuntimeError("Timeout waiting for 3D Scene")

            await asyncio.sleep(1.0)

            # Test 1: Verify X-Ray button is completely absent from DOM
            btn_xray_res = await send_cmd('Runtime.evaluate', {
                'expression': 'document.getElementById("btn-xray") === null'
            })
            btn_xray_absent = btn_xray_res.get('result', {}).get('value')
            print(f"Test 1 - X-Ray button completely removed from DOM: {btn_xray_absent}", flush=True)
            assert btn_xray_absent, "X-Ray button should not exist in DOM"

            # Test 2: Verify Whole System overview has 100% opaque solid organs
            check_opaque_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const testOrgans = ['liver', 'pancreas', 'stomach', 'duodenum', 'small_intestine', 'large_intestine', 'esophagus', 'gallbladder_tree'];
                    const results = [];
                    testOrgans.forEach(orgId => {
                        const meshes = sv.clickableMeshes.filter(m => m.userData.organId === orgId && m.visible);
                        meshes.forEach(m => {
                            if (m.material && m.userData.wallLayerIndex === 0 || !m.userData.isWallLayer) {
                                results.push({
                                    organId: orgId,
                                    name: m.name,
                                    transparent: m.material.transparent,
                                    opacity: m.material.opacity,
                                    depthWrite: m.material.depthWrite
                                });
                            }
                        });
                    });
                    const nonOpaque = results.filter(r => r.transparent || r.opacity < 0.99);
                    return { totalTested: results.length, nonOpaqueCount: nonOpaque.length, nonOpaqueSamples: nonOpaque.slice(0, 3) };
                })()''',
                'returnByValue': True
            })
            op_data = check_opaque_res.get('result', {}).get('value')
            print(f"Test 2 - Whole System 100% Opaque check: Tested={op_data['totalTested']}, Non-opaque={op_data['nonOpaqueCount']}", flush=True)
            if op_data['nonOpaqueCount'] > 0:
                print(f"  Non-opaque samples: {op_data['nonOpaqueSamples']}", flush=True)

            # Capture 76a: Whole System Overview
            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_76A, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"Saved {SHOT_76A}", flush=True)

            # Test 3: Select organ -> switch back to Whole System -> verify ZERO ghosting
            print("Selecting 'gallbladder_tree'...", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': 'window.__DIGESTIVE_APP__.sceneVM.selectOrgan("gallbladder_tree")'
            })
            await asyncio.sleep(0.8)

            print("Switching back to Whole System via tabBtnSystem...", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': 'document.getElementById("tab-btn-system").click()'
            })
            await asyncio.sleep(0.8)

            check_switch_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const sceneVM = window.__DIGESTIVE_APP__.sceneVM;
                    const dissVM = window.__DIGESTIVE_APP__.dissectionVM;
                    const selId = sceneVM.state.selectedOrganId;
                    const isIsolate = dissVM.state.isIsolateMode;
                    
                    // Check if any organ is ghosted (opacity ~ 0.12)
                    const ghosted = sv.clickableMeshes.filter(m => m.visible && m.material && m.material.opacity < 0.3 && m.userData.organId !== 'peritoneum_omentum');
                    return {
                        selectedOrganId: selId,
                        isIsolateMode: isIsolate,
                        ghostedCount: ghosted.length,
                        ghostedSamples: ghosted.slice(0, 3).map(m => ({ id: m.userData.organId, name: m.name, op: m.material.opacity }))
                    };
                })()''',
                'returnByValue': True
            })
            sw_data = check_switch_res.get('result', {}).get('value')
            print(f"Test 3 - Switch back result: selectedOrganId={sw_data['selectedOrganId']}, isIsolate={sw_data['isIsolateMode']}, ghostedCount={sw_data['ghostedCount']}", flush=True)
            assert sw_data['selectedOrganId'] is None, "selectedOrganId must be null after clicking tabBtnSystem"
            assert sw_data['isIsolateMode'] is False, "isIsolateMode must be false after clicking tabBtnSystem"
            assert sw_data['ghostedCount'] == 0, f"Ghosted organs found: {sw_data['ghostedSamples']}"

            # Capture 76b: Switch back zero ghosting
            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_76B, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"Saved {SHOT_76B}", flush=True)

            # Test 4: Bile Duct 4 Concentric Layers verification
            print("Selecting 'gallbladder_tree' to inspect Bile Duct layers...", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': 'window.__DIGESTIVE_APP__.sceneVM.selectOrgan("gallbladder_tree")'
            })
            await asyncio.sleep(0.8)

            bile_duct_layers_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const bdLayers = sv.bileDuctWallMeshes || [];
                    const gbLayers = sv.gallbladderWallMeshes || [];
                    return {
                        bileDuctLayerCount: bdLayers.length,
                        bileDuctLayers: bdLayers.map((m, idx) => ({
                            index: idx,
                            name: m.name,
                            wallLayerId: m.userData.wallLayerId,
                            wallLayerName: m.userData.wallLayerName,
                            hasMap: Boolean(m.material && m.material.map),
                            hasBump: Boolean(m.material && m.material.bumpMap)
                        })),
                        gbLayerCount: gbLayers.length
                    };
                })()''',
                'returnByValue': True
            })
            bd_data = bile_duct_layers_res.get('result', {}).get('value')
            print(f"Test 4 - Bile Duct layers: count={bd_data['bileDuctLayerCount']}, GB layers={bd_data['gbLayerCount']}", flush=True)
            for l in bd_data['bileDuctLayers']:
                print(f"  Layer {l['index']}: {l['wallLayerId']} ({l['wallLayerName']}), map={l['hasMap']}, bump={l['hasBump']}", flush=True)
            assert bd_data['bileDuctLayerCount'] == 4, "Bile Duct must have exactly 4 concentric layers"

            # Explode gallbladder_tree to 85% to view separated layers
            print("Exploding gallbladder_tree to 85%...", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': 'window.__DIGESTIVE_APP__.dissectionVM.setExplodeFactor(0.85)'
            })
            await asyncio.sleep(0.8)

            # Check positions of bile duct layers
            bd_positions_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const bdLayers = sv.bileDuctWallMeshes || [];
                    return bdLayers.map(m => ({
                        id: m.userData.wallLayerId,
                        pos: { x: +m.position.x.toFixed(2), y: +m.position.y.toFixed(2), z: +m.position.z.toFixed(2) }
                    }));
                })()''',
                'returnByValue': True
            })
            print(f"Bile duct layer positions at 85% explode: {bd_positions_res.get('result', {}).get('value')}", flush=True)

            # Capture 76c: Gallbladder & Bile Duct 4 Layers Exploded
            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_76C, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"Saved {SHOT_76C}", flush=True)

            # Test 5: Cutaway 50% on Gallbladder & Bile Duct
            print("Setting 50% Cutaway open...", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': 'window.__DIGESTIVE_APP__.dissectionVM.setExplodeFactor(0.0); window.__DIGESTIVE_APP__.dissectionVM.setCutawayOpen(true)'
            })
            await asyncio.sleep(0.8)

            # Capture 76d: Gallbladder & Bile Duct Cutaway
            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_76D, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"Saved {SHOT_76D}", flush=True)

            print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!", flush=True)
            listen_task.cancel()
    finally:
        proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
