import asyncio
import json
import urllib.request
import websockets
import subprocess
import base64
import os

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9348
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_WHOLE = os.path.join(ARTIFACT_DIR, '71a_whole_system_true_1_to_1_scale_knolling.png')
SHOT_TEETH = os.path.join(ARTIFACT_DIR, '71b_oral_cavity_teeth_and_jaw_zero_clipping.png')
SHOT_VESSELS = os.path.join(ARTIFACT_DIR, '71c_vascular_trees_intact_zero_clipping.png')
SHOT_COLON = os.path.join(ARTIFACT_DIR, '71d_isolated_colon_true_scale_no_zcompress.png')
SHOT_ORAL_ISO = os.path.join(ARTIFACT_DIR, '71e_isolated_oral_cavity_unclipped.png')

async def main():
    proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--user-data-dir=C:/Users/proto/AppData/Local/Temp/edge_v19_verify2',
        '--window-size=1600,1050',
        URL
    ])
    try:
        await asyncio.sleep(2.5)
        raw = urllib.request.urlopen(f'http://localhost:{PORT}/json').read().decode()
        tabs = json.loads(raw)
        ws_url = [t for t in tabs if t.get('type') == 'page'][0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url, max_size=100_000_000) as ws:
            req_id = 1
            pending = {}

            async def listen():
                try:
                    async for msg in ws:
                        d = json.loads(msg)
                        cid = d.get('id')
                        if cid in pending:
                            pending.pop(cid).set_result(d.get('result', {}))
                except:
                    pass

            asyncio.create_task(listen())

            async def call(method, params=None):
                nonlocal req_id
                cid = req_id
                req_id += 1
                fut = asyncio.get_running_loop().create_future()
                pending[cid] = fut
                await ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
                return await fut

            await call('Runtime.enable')
            await asyncio.sleep(3.5)

            # Wait for app readiness
            for _ in range(30):
                r = await call('Runtime.evaluate', {
                    'expression': '!!(window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.clickableMeshes && window.__DIGESTIVE_APP__.sceneView.clickableMeshes.length > 20)'
                })
                if r.get('value') is True:
                    break
                await asyncio.sleep(0.5)

            print("[CDP] App loaded successfully!")

            # =========================================================================
            # TEST 1: Whole-System Knolling Grid (Tab 1, t = 1.0)
            # =========================================================================
            await call('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan(null);
                    app.dissectionVM.setExplodeFactor(1.0);
                    sv._syncExplosion();

                    // Position camera to frame whole knolling catalog grid
                    sv.controls.target.set(0.0, 0.0, 0.0);
                    sv.camera.position.set(0.0, 0.0, 24.0);
                    sv.controls.update();
                })()
                '''
            })
            await asyncio.sleep(0.6)
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_WHOLE, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_WHOLE}")

            # Close-up 1: Oral Cavity & Dentition (Mandible center = -10.65, 2.68, 0.0)
            await call('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    sv.controls.target.set(-10.65, 2.68, 0.0);
                    sv.camera.position.set(-10.65, 2.68, 2.8);
                    sv.controls.update();
                })()
                '''
            })
            await asyncio.sleep(0.6)
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_TEETH, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_TEETH}")

            # Close-up 2: Vascular Trees (IVC center = +8.80, 0.97, 0.0)
            await call('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    sv.controls.target.set(7.8, 0.97, 0.0);
                    sv.camera.position.set(7.8, 0.97, 4.2);
                    sv.controls.update();
                })()
                '''
            })
            await asyncio.sleep(0.6)
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_VESSELS, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_VESSELS}")

            # =========================================================================
            # TEST 2: Isolated Colon Layer Explosion (Tab 2, t = 1.0)
            # =========================================================================
            await call('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan('large_intestine');
                    app.dissectionVM.setExplodeFactor(1.0);
                    sv._syncExplosion();

                    // Smooth colon camera framing
                    sv.controls.target.set(-0.2, -0.3, 0.0);
                    sv.camera.position.set(-0.2, 0.0, 11.5);
                    sv.controls.update();
                })()
                '''
            })
            await asyncio.sleep(0.8)
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_COLON, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_COLON}")

            # =========================================================================
            # TEST 3: Isolated Oral Cavity Explosion (Tab 2, t = 1.0)
            # =========================================================================
            await call('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan('oral_cavity');
                    app.dissectionVM.setExplodeFactor(1.0);
                    sv._syncExplosion();

                    sv.controls.target.set(0.0, 2.8, 0.35);
                    sv.camera.position.set(0.4, 2.9, 4.2);
                    sv.controls.update();
                })()
                '''
            })
            await asyncio.sleep(0.8)
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_ORAL_ISO, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_ORAL_ISO}")

    finally:
        proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
