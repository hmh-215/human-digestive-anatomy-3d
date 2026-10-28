import asyncio
import json
import urllib.request
import websockets
import subprocess
import base64
import os

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9331
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_ESO = os.path.join(ARTIFACT_DIR, '70a_esophagus_cutaway_default_left_hidden_no_toggle.png')
SHOT_COLON_ANT = os.path.join(ARTIFACT_DIR, '70b_colon_cutaway_anterior_landmark_aligned.png')
SHOT_COLON_OBL = os.path.join(ARTIFACT_DIR, '70c_colon_cutaway_oblique_landmark_aligned.png')
SHOT_COLON_HEP = os.path.join(ARTIFACT_DIR, '70d_colon_hepatic_flexure_smooth_cut.png')
SHOT_COLON_SPL = os.path.join(ARTIFACT_DIR, '70e_colon_splenic_flexure_smooth_cut.png')

async def main():
    proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--user-data-dir=C:/Users/proto/AppData/Local/Temp/edge_v18_verify',
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
            loop = asyncio.get_running_loop()

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
                fut = loop.create_future()
                pending[cid] = fut
                await ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
                return await fut

            await call('Runtime.enable')
            await asyncio.sleep(2.0)

            # Wait for app ready
            for _ in range(30):
                r = await call('Runtime.evaluate', {
                    'expression': 'window.__DIGESTIVE_APP__?.sceneView?.clickableMeshes?.length || 0',
                    'returnByValue': True
                })
                if r.get('result', {}).get('result', {}).get('value', 0) > 100:
                    break
                await asyncio.sleep(0.5)

            # -------------------------------------------------------------
            # TEST 1: Esophagus Cutaway - Left-Half Hidden & No Toggle Button
            # -------------------------------------------------------------
            r_eso = await call('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    
                    const toggleExists = !!document.getElementById('btn-eso-side-toggle');
                    
                    app.sceneVM.selectOrgan('esophagus');
                    app.dissectionVM.setOrganDisplayMode('layers');
                    app.dissectionVM.setIsolateMode(true);
                    app.dissectionVM.setCutawayOpen(true);
                    sv._syncExplosion();
                    sv._updateOrganVisuals('esophagus');
                    sv.focusEsophagus();
                    
                    const esoMeshes = sv.stomachBuilder.organLayersMap.get('esophagus') || [];
                    const uSide = esoMeshes[0]?.material?.userData?.uCutSide?.value;
                    const uActive = esoMeshes[0]?.material?.userData?.uCutawayActive?.value;
                    
                    return {
                        toggleButtonInDOM: toggleExists,
                        esophagusCutSide: uSide,
                        esophagusCutActive: uActive,
                        layerCount: esoMeshes.length
                    };
                })()
                """,
                'returnByValue': True
            })
            print("[Test 1: Esophagus Check]", json.dumps(r_eso.get('result', {}).get('value', {}), indent=2))

            await asyncio.sleep(1.2)
            shot1 = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_ESO, 'wb') as f:
                f.write(base64.b64decode(shot1['data']))
            print(f"[Captured] {SHOT_ESO}")

            # -------------------------------------------------------------
            # TEST 2: Large Intestine (Colon) - Landmark Aligned Cutaway (Anterior)
            # -------------------------------------------------------------
            r_colon = await call('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    
                    app.sceneVM.selectOrgan('large_intestine');
                    app.dissectionVM.setOrganDisplayMode('layers');
                    app.dissectionVM.setIsolateMode(true);
                    app.dissectionVM.setCutawayOpen(true);
                    sv._syncExplosion();
                    sv._updateOrganVisuals('large_intestine');
                    sv.focusColon();
                    
                    const colonMeshes = sv.stomachBuilder.organLayersMap.get('large_intestine') || [];
                    const m0 = colonMeshes[0];
                    const cutDist = m0?.geometry?.attributes?.aCutDist;
                    
                    let posCount = 0, negCount = 0;
                    if (cutDist) {
                        for (let i = 0; i < cutDist.count; i++) {
                            if (cutDist.getX(i) > 0) posCount++;
                            else negCount++;
                        }
                    }
                    
                    return {
                        colonLayerCount: colonMeshes.length,
                        totalVertices: cutDist?.count || 0,
                        cutDiscardCount: posCount,
                        keptCount: negCount,
                        discardRatio: (posCount / (cutDist?.count || 1)).toFixed(3)
                    };
                })()
                """,
                'returnByValue': True
            })
            print("[Test 2: Colon Stats]", json.dumps(r_colon.get('result', {}).get('value', {}), indent=2))

            await asyncio.sleep(1.2)
            shot2 = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_COLON_ANT, 'wb') as f:
                f.write(base64.b64decode(shot2['data']))
            print(f"[Captured] {SHOT_COLON_ANT}")

            # -------------------------------------------------------------
            # TEST 3: Large Intestine - Oblique / 3/4 View (matching Image 2)
            # -------------------------------------------------------------
            await call('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    const center = sv.stomachBuilder.getBaseCenter('large_intestine');
                    // Orbit camera to 3/4 oblique view (X: +8.5, Y: center.y + 1.2, Z: center.z + 8.5)
                    sv.camera.position.set(center.x + 7.5, center.y + 1.2, center.z + 8.8);
                    sv.controls.target.set(center.x, center.y, center.z);
                    sv.controls.update();
                })()
                """
            })
            await asyncio.sleep(1.0)
            shot3 = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_COLON_OBL, 'wb') as f:
                f.write(base64.b64decode(shot3['data']))
            print(f"[Captured] {SHOT_COLON_OBL}")

            # -------------------------------------------------------------
            # TEST 4: Zoom on Hepatic Flexure (Right Colic Flexure)
            # -------------------------------------------------------------
            await call('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    // Hepatic Flexure is around x = -6.8, y = 111.5, z = 4.5 in local coords
                    // MasterRoot is scaled by ~0.154 centered at 0
                    // Let's frame directly around the hepatic flexure
                    sv.camera.position.set(-1.1, 0.45, 2.8);
                    sv.controls.target.set(-1.0, 0.40, 0.5);
                    sv.controls.update();
                })()
                """
            })
            await asyncio.sleep(1.0)
            shot4 = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_COLON_HEP, 'wb') as f:
                f.write(base64.b64decode(shot4['data']))
            print(f"[Captured] {SHOT_COLON_HEP}")

            # -------------------------------------------------------------
            # TEST 5: Zoom on Splenic Flexure (Left Colic Flexure)
            # -------------------------------------------------------------
            await call('Runtime.evaluate', {
                'expression': """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    // Splenic Flexure is around x = +8.5, y = 111.0, z = 3.5 in local coords
                    sv.camera.position.set(1.2, 0.45, 2.8);
                    sv.controls.target.set(1.1, 0.40, 0.5);
                    sv.controls.update();
                })()
                """
            })
            await asyncio.sleep(1.0)
            shot5 = await call('Page.captureScreenshot', {'format': 'png'})
            with open(SHOT_COLON_SPL, 'wb') as f:
                f.write(base64.b64decode(shot5['data']))
            print(f"[Captured] {SHOT_COLON_SPL}")

    finally:
        proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
