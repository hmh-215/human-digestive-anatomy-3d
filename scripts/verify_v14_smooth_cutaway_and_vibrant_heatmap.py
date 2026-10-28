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
PORT = 9299
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SCREENSHOT_66A = os.path.join(ARTIFACT_DIR, '66a_duodenum_smooth_subdivided_cutaway.png')
SCREENSHOT_66B = os.path.join(ARTIFACT_DIR, '66b_stomach_smooth_coronal_cutaway.png')
SCREENSHOT_66C = os.path.join(ARTIFACT_DIR, '66c_esophagus_smooth_cutaway.png')
SCREENSHOT_66D = os.path.join(ARTIFACT_DIR, '66d_stomach_vibrant_heatmap.png')
SCREENSHOT_66E = os.path.join(ARTIFACT_DIR, '66e_duodenum_vibrant_heatmap.png')
SCREENSHOT_66F = os.path.join(ARTIFACT_DIR, '66f_pancreas_vibrant_heatmap.png')

async def main():
    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge with temp dir: {temp_dir}...", flush=True)
    proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        f'--user-data-dir={temp_dir}',
        '--window-size=1600,1000',
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
        print(f"Connected! Found {len(page_tabs)} page tabs", flush=True)

        async with websockets.connect(ws_url, max_size=200_000_000) as ws:
            req_id = 1
            pending = {}
            loop = asyncio.get_running_loop()

            async def listen():
                try:
                    async for msg in ws:
                        data = json.loads(msg)
                        cid = data.get('id')
                        if cid in pending:
                            fut = pending.pop(cid)
                            if 'error' in data:
                                fut.set_exception(Exception(data['error']))
                            else:
                                fut.set_result(data.get('result', {}))
                except asyncio.CancelledError:
                    pass

            listen_task = asyncio.create_task(listen())

            async def send_req(method, params=None):
                nonlocal req_id
                cid = req_id
                req_id += 1
                fut = loop.create_future()
                pending[cid] = fut
                await ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
                return await fut

            await send_req('Runtime.enable')
            await send_req('Page.enable')
            print("Navigating to app URL...", flush=True)
            await send_req('Page.navigate', {'url': URL})

            # Wait dynamically until 3D models are fully loaded
            loaded = False
            for attempt in range(35):
                await asyncio.sleep(0.5)
                res = await send_req('Runtime.evaluate', {
                    'expression': 'window.__DIGESTIVE_APP__?.sceneView?.clickableMeshes?.length || 0',
                    'returnByValue': True
                })
                count = res.get('result', {}).get('value', 0)
                if count > 100:
                    print(f"3D Models fully loaded! clickableMeshes = {count}", flush=True)
                    loaded = True
                    break
            if not loaded:
                raise RuntimeError("Timeout waiting for 3D models to load")

            await asyncio.sleep(1.0)

            # -------------------------------------------------------------
            # STEP 1: Duodenum Cutaway with Subdivided Mesh & GMLS (Testing Jaggedness Fix)
            # -------------------------------------------------------------
            print("Step 1: Selecting Duodenum in Isolated Tab with Cutaway (Subdivided Smooth Edge)...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    document.getElementById('tab-btn-organ')?.click();
                    const pin = document.querySelector('.body-pin[data-organ="duodenum"]');
                    if (pin) pin.click();
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('duodenum');
                    app.dissectionVM.setState({ isIsolateMode: true, isCutawayOpen: true });
                    app.sceneView.focusDuodenum();
                    // Match camera orientation of user's uploaded screenshot 2
                    app.sceneView.camera.position.set(-1.8, -0.4, 4.2);
                    app.sceneView.controls.target.set(-0.35, -0.65, 0.45);
                    app.sceneView.controls.update();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)

            # Check vertex count of duodenum layer
            duo_info = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const m = app.sceneView.duodenumWallMeshes?.[0];
                    return {
                        subdividedVerts: m?.geometry?.attributes?.position?.count || 0,
                        hasCutDist: !!m?.geometry?.attributes?.aCutDist
                    };
                })()''',
                'returnByValue': True
            })
            print(f"Duodenum Layer Mesh Info: {json.dumps(duo_info.get('result', {}).get('value'))}", flush=True)

            ss1 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img1 = base64.b64decode(ss1['data'])
            with open(SCREENSHOT_66A, 'wb') as f:
                f.write(img1)
            print(f"Captured 66a (Duodenum Smooth Subdivided Cutaway): {len(img1)} bytes", flush=True)

            # -------------------------------------------------------------
            # STEP 2: Stomach Coronal Cutaway
            # -------------------------------------------------------------
            print("Step 2: Selecting Stomach in Isolated Tab with Coronal Cutaway...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="stomach"]');
                    if (pin) pin.click();
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('stomach');
                    app.dissectionVM.setState({ isIsolateMode: true, isCutawayOpen: true });
                    app.sceneView.focusStomach();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)

            ss2 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img2 = base64.b64decode(ss2['data'])
            with open(SCREENSHOT_66B, 'wb') as f:
                f.write(img2)
            print(f"Captured 66b (Stomach Smooth Coronal Cutaway): {len(img2)} bytes", flush=True)

            # -------------------------------------------------------------
            # STEP 3: Esophagus Cutaway (Hiding Left Half)
            # -------------------------------------------------------------
            print("Step 3: Selecting Esophagus in Isolated Tab with Cutaway...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="esophagus"]');
                    if (pin) pin.click();
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('esophagus');
                    app.dissectionVM.setState({ isIsolateMode: true, isCutawayOpen: true });
                    app.sceneView.focusEsophagus();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)

            ss3 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img3 = base64.b64decode(ss3['data'])
            with open(SCREENSHOT_66C, 'wb') as f:
                f.write(img3)
            print(f"Captured 66c (Esophagus Smooth Cutaway): {len(img3)} bytes", flush=True)

            # -------------------------------------------------------------
            # STEP 4: High-Vibrancy Thermal Heatmap (Stomach, Duodenum, Pancreas)
            # -------------------------------------------------------------
            print("Step 4: Testing High-Vibrancy Thermal Heatmap on Stomach...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="stomach"]');
                    if (pin) pin.click();
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('stomach');
                    document.getElementById('label-mode-regions')?.click();
                    app.dissectionVM.setState({ isCutawayOpen: false });
                    app.sceneView.focusStomach();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)

            ss4 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img4 = base64.b64decode(ss4['data'])
            with open(SCREENSHOT_66D, 'wb') as f:
                f.write(img4)
            print(f"Captured 66d (Stomach Vibrant Heatmap): {len(img4)} bytes", flush=True)

            print("Step 5: Testing High-Vibrancy Thermal Heatmap on Duodenum...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="duodenum"]');
                    if (pin) pin.click();
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('duodenum');
                    app.sceneView.focusDuodenum();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)

            ss5 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img5 = base64.b64decode(ss5['data'])
            with open(SCREENSHOT_66E, 'wb') as f:
                f.write(img5)
            print(f"Captured 66e (Duodenum Vibrant Heatmap): {len(img5)} bytes", flush=True)

            print("Step 6: Testing High-Vibrancy Thermal Heatmap on Pancreas...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="pancreas"]');
                    if (pin) pin.click();
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('pancreas');
                    app.sceneView.focusOrgan('pancreas');
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)

            ss6 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img6 = base64.b64decode(ss6['data'])
            with open(SCREENSHOT_66F, 'wb') as f:
                f.write(img6)
            print(f"Captured 66f (Pancreas Vibrant Heatmap): {len(img6)} bytes", flush=True)

            listen_task.cancel()
            print("\nALL V14 SMOOTH CUTAWAY & VIBRANT HEATMAP TESTS COMPLETED SUCCESSFULLY!", flush=True)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
