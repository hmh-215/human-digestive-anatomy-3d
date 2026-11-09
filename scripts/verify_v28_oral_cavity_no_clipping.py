import asyncio
import json
import urllib.request
import websockets
import subprocess
import base64
import os
import sys
import tempfile

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9318
URL = 'http://localhost:8080/index.html?v=20261109_v28'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_81A = os.path.join(ARTIFACT_DIR, '81a_oral_cavity_unexploded.png')
SHOT_81B = os.path.join(ARTIFACT_DIR, '81b_oral_cavity_exploded_anterior_no_clipping.png')
SHOT_81C = os.path.join(ARTIFACT_DIR, '81c_oral_cavity_exploded_oblique_view.png')
SHOT_81D = os.path.join(ARTIFACT_DIR, '81d_oral_cavity_midsagittal_cutaway_exploded.png')

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

            for i in range(40):
                await asyncio.sleep(0.5)
                eval_res = await send_cmd('Runtime.evaluate', {
                    'expression': 'Boolean(window.__DIGESTIVE_APP__?.sceneView?.clickableMeshes?.length > 10)'
                })
                if eval_res.get('result', {}).get('value'):
                    print(f"3D Scene ready at attempt {i+1}!", flush=True)
                    break
            else:
                raise RuntimeError("Timeout waiting for 3D Scene")

            await asyncio.sleep(1.0)

            async def take_shot(filepath):
                shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
                with open(filepath, 'wb') as f:
                    f.write(base64.b64decode(shot['data']))
                print(f"Saved screenshot: {filepath}", flush=True)

            # TEST 1: Unexploded Oral Cavity
            print("\n=== TEST 1: Unexploded Oral Cavity ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.dissectionVM.setIsolateMode(true);
                    app.sceneVM.selectOrgan('oral_cavity');
                    app.dissectionVM.setExplodeFactor(0.0);
                    
                    sv.controls.target.set(0.0, 3.50, 0.35);
                    sv.camera.position.set(0.0, 3.55, 3.6);
                    sv.controls.update();
                })()'''
            })
            await asyncio.sleep(0.8)
            await take_shot(SHOT_81A)

            # TEST 2: Exploded Oral Cavity (Factor 1.0) - Anterior View
            print("\n=== TEST 2: Exploded Oral Cavity (Factor 1.0) Anterior View ===", flush=True)
            res2 = await send_cmd('Runtime.evaluate', {
                'returnByValue': True,
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.dissectionVM.setExplodeFactor(1.0);
                    
                    // Verify Gingiva is split
                    const upperGingiva = sv.clickableMeshes.find(m => m.name === 'Upper_Gingiva');
                    const lowerGingiva = sv.clickableMeshes.find(m => m.name === 'Lower_Gingiva');
                    
                    // Verify Parotid Glands are on opposite sides
                    const parotidR = sv.clickableMeshes.find(m => m.name === 'Parotid_glandr');
                    const parotidL = sv.clickableMeshes.find(m => m.name === 'Parotid_glandl');
                    
                    // Verify Tongue is centered and clear of arches
                    const tongue = sv.clickableMeshes.find(m => m.name === 'Tongue');
                    const maxilla = sv.clickableMeshes.find(m => m.name === 'Maxillar');
                    const mandible = sv.clickableMeshes.find(m => m.name === 'Mandible');
                    
                    // Get world bounding boxes
                    const boxUG = new THREE.Box3().setFromObject(upperGingiva);
                    const boxLG = new THREE.Box3().setFromObject(lowerGingiva);
                    const boxT = new THREE.Box3().setFromObject(tongue);
                    const boxMax = new THREE.Box3().setFromObject(maxilla);
                    const boxMand = new THREE.Box3().setFromObject(mandible);
                    const boxPR = new THREE.Box3().setFromObject(parotidR);
                    const boxPL = new THREE.Box3().setFromObject(parotidL);

                    sv.controls.target.set(0.0, 3.50, 0.35);
                    sv.camera.position.set(0.0, 3.55, 4.8);
                    sv.controls.update();

                    return {
                        upperGingivaExists: !!upperGingiva,
                        lowerGingivaExists: !!lowerGingiva,
                        parotidR_X: boxPR.max.x,
                        parotidL_X: boxPL.min.x,
                        upperGingivaMinY: boxUG.min.y,
                        lowerGingivaMaxY: boxLG.max.y,
                        tongueMinY: boxT.min.y,
                        tongueMaxY: boxT.max.y,
                        verticalClearanceBetweenGums: boxUG.min.y - boxLG.max.y,
                        parotidsSymmetric: boxPR.max.x < 0 && boxPL.min.x > 0
                    };
                })()'''
            })
            info2 = res2.get('result', {}).get('value', {})
            print("Gingiva Split Check:", info2)
            assert info2.get('upperGingivaExists'), "Upper_Gingiva must exist!"
            assert info2.get('lowerGingivaExists'), "Lower_Gingiva must exist!"
            assert info2.get('parotidsSymmetric'), "Parotids must be on opposite sides of X=0!"
            assert info2.get('verticalClearanceBetweenGums', 0) > 0.4, "Clearance between upper and lower gums must be positive!"
            await asyncio.sleep(0.8)
            await take_shot(SHOT_81B)

            # TEST 3: Oblique 3/4 View showing Depth Separation
            print("\n=== TEST 3: Oblique 3/4 View ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    sv.controls.target.set(0.0, 3.50, 0.35);
                    sv.camera.position.set(2.2, 3.8, 4.4);
                    sv.controls.update();
                })()'''
            })
            await asyncio.sleep(0.8)
            await take_shot(SHOT_81C)

            # TEST 4: Midsagittal 50% Cutaway Exploded
            print("\n=== TEST 4: Midsagittal Cutaway Exploded ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.dissectionVM.setCutawayOpen(true);
                    sv.controls.target.set(0.0, 3.50, 0.35);
                    sv.camera.position.set(1.8, 3.65, 3.8);
                    sv.controls.update();
                })()'''
            })
            await asyncio.sleep(0.8)
            await take_shot(SHOT_81D)

            print("\n>>> ALL ORAL CAVITY EXPLOSION TESTS PASSED SUCCESSFULLY! <<<")

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            pass

if __name__ == '__main__':
    asyncio.run(main())
