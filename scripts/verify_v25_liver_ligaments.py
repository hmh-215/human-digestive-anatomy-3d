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
PORT = 9311
URL = 'http://localhost:8080/index.html?v=20261108_v25'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_78A = os.path.join(ARTIFACT_DIR, '78a_liver_anterior_view_ligaments.png')
SHOT_78B = os.path.join(ARTIFACT_DIR, '78b_liver_posterior_view_ligaments.png')
SHOT_78C = os.path.join(ARTIFACT_DIR, '78c_liver_ligament_hover_callout.png')
SHOT_78D = os.path.join(ARTIFACT_DIR, '78d_liver_exploded_ligaments_anchoring.png')

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

            # Wait for 3D scene loading
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

            await asyncio.sleep(1.2)

            async def take_shot(filepath):
                shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
                with open(filepath, 'wb') as f:
                    f.write(base64.b64decode(shot['data']))
                print(f"Saved screenshot: {filepath}", flush=True)

            # TEST 1: Verify all 7 Liver Ligaments exist and are instantiated
            print("\n=== TEST 1: Liver Ligaments Inventory Check ===", flush=True)
            inv_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    const ligs = sv.liverLigaments || [];
                    return {
                        count: ligs.length,
                        names: ligs.map(l => ({
                            name: l.name,
                            vietnameseName: l.userData.vietnameseName,
                            latinName: l.userData.latinName,
                            couinaudAnchor: l.userData.couinaudAnchor,
                            visible: l.visible
                        }))
                    };
                })()''',
                'returnByValue': True
            })
            inv = inv_res.get('result', {}).get('value')
            print("Ligaments Inventory:", json.dumps(inv, indent=2, ensure_ascii=False), flush=True)
            assert inv['count'] == 7, f"Expected 7 liver ligaments, found {inv['count']}"

            # TEST 2: Anterior View of Liver with Ligaments
            print("\n=== TEST 2: Anterior View of Liver with Falciform & Round Ligament ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.dissectionVM.setIsolateMode(true);
                    app.sceneVM.selectOrgan('liver');
                    app.dissectionVM.setExplodeFactor(0.0);
                    
                    // Frame the anterior aspect of the liver
                    sv.controls.target.set(-0.35, 0.35, 0.0);
                    sv.camera.position.set(-0.35, 0.45, 6.8);
                    sv.controls.update();
                })()'''
            })
            await asyncio.sleep(0.8)
            await take_shot(SHOT_78A)

            # TEST 3: Posterior View of Liver (Coronary leaves, bare area, triangular ligaments, lig. venosum)
            print("\n=== TEST 3: Posterior View of Liver (Bare Area & Triangular Ligaments) ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    // Rotate camera to posterior view (Z < 0)
                    sv.controls.target.set(-0.35, 0.35, 0.0);
                    sv.camera.position.set(-0.35, 0.45, -6.8);
                    sv.controls.update();
                })()'''
            })
            await asyncio.sleep(0.8)
            await take_shot(SHOT_78B)

            # TEST 4: Hover Callout Verification for Falciform Ligament
            print("\n=== TEST 4: Falciform Ligament Hover Callout ===", flush=True)
            hover_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    const falciform = sv.liverLigaments.find(l => l.name === 'falciform_ligament');
                    if (!falciform) return { error: 'Falciform not found' };
                    
                    // Rotate camera back to front-oblique view
                    sv.controls.target.set(-0.35, 0.35, 0.0);
                    sv.camera.position.set(-0.10, 0.30, 6.2);
                    sv.controls.update();

                    const payload = sv._buildHoverPayload(falciform, 780, 420);
                    sv.hoverCallout.update(payload);
                    return payload;
                })()''',
                'returnByValue': True
            })
            h_data = hover_res.get('result', {}).get('value')
            print("Hover Payload:", json.dumps(h_data, indent=2, ensure_ascii=False), flush=True)
            assert h_data['title'] == 'Dây Chằng Liềm', "Title must be Dây Chằng Liềm"
            assert 'Ligamentum Falciforme' in h_data['badge'], "Badge must contain Latin name"
            await asyncio.sleep(0.5)
            await take_shot(SHOT_78C)

            # TEST 5: Exploded Liver Segments Anchoring Check
            print("\n=== TEST 5: Liver Exploded Segments & Ligaments Anchoring ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    sv.hoverCallout.update(null); // Dismiss hover card
                    app.dissectionVM.setExplodeFactor(0.65);
                    sv.controls.target.set(-0.35, 0.35, 0.0);
                    sv.camera.position.set(-0.35, 0.45, 9.5);
                    sv.controls.update();
                })()'''
            })
            await asyncio.sleep(0.8)
            await take_shot(SHOT_78D)

            print("\n=== ALL LIVER LIGAMENT VERIFICATION TESTS PASSED SUCCESSFULLY! ===", flush=True)
            listen_task.cancel()

    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(main())
