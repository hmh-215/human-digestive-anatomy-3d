import asyncio
import json
import urllib.request
import websockets
import subprocess
import base64
import os

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9355
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_WHOLE = os.path.join(ARTIFACT_DIR, '72a_whole_system_expanded_spacing_knolling.png')
SHOT_ROW1_ROW2 = os.path.join(ARTIFACT_DIR, '72b_row1_and_row2_vertical_clearance.png')
SHOT_ROW3_ROW4 = os.path.join(ARTIFACT_DIR, '72c_row3_and_row4_colon_clearance.png')
SHOT_COLON_ISO = os.path.join(ARTIFACT_DIR, '72d_isolated_colon_increased_layer_spacing.png')

async def main():
    proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--user-data-dir=C:/Users/proto/AppData/Local/Temp/edge_v20_spacing',
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

            # 1. Whole system knolling at 100% explode
            diag = await call('Runtime.evaluate', {
                'returnByValue': True,
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan(null);
                    app.dissectionVM.setExplodeFactor(1.0);
                    sv._syncExplosion();

                    const getBox = m => {
                        const b = new THREE.Box3().setFromObject(m);
                        return { minY: b.min.y, maxY: b.max.y, minX: b.min.x, maxX: b.max.x };
                    };

                    const r1_items = sv.clickableMeshes.filter(m => !m.userData.knollingAnchor && ['oral_cavity', 'pharynx', 'esophagus', 'stomach', 'duodenum'].includes(m.userData.organId)).map(getBox);
                    const r2_items = sv.clickableMeshes.filter(m => !m.userData.knollingAnchor && ['liver', 'gallbladder_tree', 'pancreas', 'portal_system', 'hepatic_artery', 'hepatic_veins'].includes(m.userData.organId)).map(getBox);
                    const r3_items = sv.clickableMeshes.filter(m => !m.userData.knollingAnchor && ['small_intestine', 'peritoneum_omentum'].includes(m.userData.organId)).map(getBox);
                    const r4_items = sv.clickableMeshes.filter(m => !m.userData.knollingAnchor && ['large_intestine'].includes(m.userData.organId)).map(getBox);

                    const getY = items => ({
                        minY: Math.min(...items.map(i => i.minY)),
                        maxY: Math.max(...items.map(i => i.maxY))
                    });

                    const r1 = getY(r1_items);
                    const r2 = getY(r2_items);
                    const r3 = getY(r3_items);
                    const r4 = getY(r4_items);

                    // Auto frame full grid
                    sv.controls.target.set(0.0, -0.85, 0.0);
                    sv.camera.position.set(0.0, -0.85, 33.5);
                    sv.controls.update();

                    return {
                        row1: r1,
                        gap_r1_r2: r1.minY - r2.maxY,
                        row2: r2,
                        gap_r2_r3: r2.minY - r3.maxY,
                        row3: r3,
                        gap_r3_r4: r3.minY - r4.maxY,
                        row4: r4,
                        colonItemsCount: r4_items.length
                    };
                })()
                '''
            })
            print("[CDP] Vertical clearances at t=1.0:")
            print(json.dumps(diag.get('value', {}), indent=2))
            await asyncio.sleep(0.6)

            # Capture whole knolling overview
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_WHOLE, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_WHOLE}")

            # 2. Close-up on Row 1 and Row 2 clearance (Esophagus bottom vs Liver top)
            await call('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    sv.controls.target.set(-5.0, 1.8, 0.0);
                    sv.camera.position.set(-5.0, 1.8, 12.0);
                    sv.controls.update();
                })()
                '''
            })
            await asyncio.sleep(0.6)
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_ROW1_ROW2, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_ROW1_ROW2}")

            # 3. Close-up on Row 3 and Row 4 clearance (Small Intestine vs Colon frame)
            await call('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    sv.controls.target.set(0.0, -3.8, 0.0);
                    sv.camera.position.set(0.0, -3.8, 16.0);
                    sv.controls.update();
                })()
                '''
            })
            await asyncio.sleep(0.6)
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_ROW3_ROW4, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_ROW3_ROW4}")

            # 4. Isolated Colon with increased layer spacing
            await call('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan('large_intestine');
                    app.dissectionVM.setExplodeFactor(1.0);
                    sv._syncExplosion();

                    sv.controls.target.set(-0.2, -0.3, 0.0);
                    sv.camera.position.set(-0.2, 0.0, 12.5);
                    sv.controls.update();
                })()
                '''
            })
            await asyncio.sleep(0.8)
            shot = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_COLON_ISO, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[CDP] Saved: {SHOT_COLON_ISO}")

    finally:
        proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
