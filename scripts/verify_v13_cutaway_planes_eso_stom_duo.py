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

SCREENSHOT_65A = os.path.join(ARTIFACT_DIR, '65a_esophagus_cutaway_hide_left_half.png')
SCREENSHOT_65B = os.path.join(ARTIFACT_DIR, '65b_esophagus_cutaway_hide_right_half.png')
SCREENSHOT_65C = os.path.join(ARTIFACT_DIR, '65c_stomach_coronal_cutaway_along_curvatures.png')
SCREENSHOT_65D = os.path.join(ARTIFACT_DIR, '65d_stomach_coronal_interior_cavity.png')
SCREENSHOT_65E = os.path.join(ARTIFACT_DIR, '65e_duodenum_c_loop_cutaway_d1_to_d4.png')

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
            # STEP 1: Esophagus (Thực quản) - Ảnh 1
            # -------------------------------------------------------------
            print("Step 1: Selecting Esophagus in Isolated Tab with Cutaway...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    document.getElementById('tab-btn-organ')?.click();
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

            # Verify button state
            btn_eval = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const btn = document.getElementById('btn-eso-side-toggle');
                    return {
                        visible: btn && !btn.classList.contains('hidden'),
                        text: btn ? btn.textContent.trim() : null
                    };
                })()''',
                'returnByValue': True
            })
            print(f"Esophagus Side Toggle UI Info: {json.dumps(btn_eval.get('result', {}).get('value'))}", flush=True)

            # Capture 65a: Esophagus (hide left half by default)
            ss1 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img1 = base64.b64decode(ss1['data'])
            with open(SCREENSHOT_65A, 'wb') as f:
                f.write(img1)
            print(f"Captured 65a (Esophagus Cutaway Hide Left Half): {len(img1)} bytes", flush=True)

            # Toggle button to hide right half
            print("Step 1b: Toggling Esophagus to Hide Right Half...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': "document.getElementById('btn-eso-side-toggle')?.click();",
                'returnByValue': True
            })
            await asyncio.sleep(1.5)

            ss1b = await send_req('Page.captureScreenshot', {'format': 'png'})
            img1b = base64.b64decode(ss1b['data'])
            with open(SCREENSHOT_65B, 'wb') as f:
                f.write(img1b)
            print(f"Captured 65b (Esophagus Cutaway Hide Right Half): {len(img1b)} bytes", flush=True)

            # Toggle back to hide left half (user default)
            await send_req('Runtime.evaluate', {
                'expression': "document.getElementById('btn-eso-side-toggle')?.click();",
                'returnByValue': True
            })
            await asyncio.sleep(0.5)

            # -------------------------------------------------------------
            # STEP 2: Stomach (Dạ dày) - Ảnh 2 (Coronal Cut along Curvatures)
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
            with open(SCREENSHOT_65C, 'wb') as f:
                f.write(img2)
            print(f"Captured 65c (Stomach Coronal Cutaway along Curvatures): {len(img2)} bytes", flush=True)

            # Rotate camera slightly for angled view to inspect open gastric cavity
            print("Step 2b: Rotating camera to view inside gastric lumen...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneView.camera.position.set(-1.0, 1.2, 5.0);
                    app.sceneView.controls.target.set(0.688, 0.339, 0.206);
                    app.sceneView.controls.update();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(1.5)

            ss2b = await send_req('Page.captureScreenshot', {'format': 'png'})
            img2b = base64.b64decode(ss2b['data'])
            with open(SCREENSHOT_65D, 'wb') as f:
                f.write(img2b)
            print(f"Captured 65d (Stomach Coronal Interior Cavity): {len(img2b)} bytes", flush=True)

            # -------------------------------------------------------------
            # STEP 3: Duodenum (Tá tràng) - Ảnh 3 (C-loop tube cut D1 -> D4)
            # -------------------------------------------------------------
            print("Step 3: Selecting Duodenum in Isolated Tab with C-loop Cutaway...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="duodenum"]');
                    if (pin) pin.click();
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('duodenum');
                    app.dissectionVM.setState({ isIsolateMode: true, isCutawayOpen: true });
                    app.sceneView.focusDuodenum();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)

            ss3 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img3 = base64.b64decode(ss3['data'])
            with open(SCREENSHOT_65E, 'wb') as f:
                f.write(img3)
            print(f"Captured 65e (Duodenum C-loop Cutaway D1 to D4): {len(img3)} bytes", flush=True)

            listen_task.cancel()
            print("\nALL V13 TESTS COMPLETED AND CAPTURED SUCCESSFULLY!", flush=True)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
