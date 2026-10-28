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

SCREENSHOT_64A = os.path.join(ARTIFACT_DIR, '64a_stomach_cutaway_following_red_line.png')
SCREENSHOT_64B = os.path.join(ARTIFACT_DIR, '64b_duodenum_cutaway_following_c_loop_red_line.png')
SCREENSHOT_64C = os.path.join(ARTIFACT_DIR, '64c_duodenum_thermal_heatmap_hot_to_cold.png')
SCREENSHOT_64D = os.path.join(ARTIFACT_DIR, '64d_stomach_thermal_heatmap_hot_to_cold.png')
SCREENSHOT_64E = os.path.join(ARTIFACT_DIR, '64e_pancreas_thermal_heatmap_hot_to_cold.png')

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
        print(f"Connected! Found {len(page_tabs)} page tabs", flush=True)
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        
        async with websockets.connect(ws_url, max_size=30*1024*1024) as ws:
            req_counter = 0
            pending = {}
            
            async def send_req(method, params=None):
                nonlocal req_counter
                req_counter += 1
                mid = req_counter
                fut = asyncio.get_running_loop().create_future()
                pending[mid] = fut
                msg = {'id': mid, 'method': method}
                if params:
                    msg['params'] = params
                await ws.send(json.dumps(msg))
                return await fut

            async def listen():
                try:
                    async for raw in ws:
                        data = json.loads(raw)
                        mid = data.get('id')
                        if mid and mid in pending:
                            fut = pending.pop(mid)
                            if 'error' in data:
                                fut.set_exception(Exception(data['error']))
                            else:
                                fut.set_result(data.get('result', {}))
                except asyncio.CancelledError:
                    pass

            listen_task = asyncio.create_task(listen())
            
            await send_req('Runtime.enable')
            await send_req('Page.enable')
            print("Navigating to app URL...", flush=True)
            await send_req('Page.navigate', {'url': URL})
            
            # Wait dynamically until 3D models and layers are fully initialized
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
            # TEST 1: Stomach Cutaway along the exact Red Line Landmarks
            # -------------------------------------------------------------
            print("Step 1: Selecting Stomach in Isolated Tab with Cutaway...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    document.getElementById('tab-btn-organ')?.click();
                    const pin = document.querySelector('.body-pin[data-organ="stomach"]');
                    if (pin) pin.click();
                    window.__DIGESTIVE_APP__?.dissectionVM?.setState({ isIsolateMode: true, isCutawayOpen: true });
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            ss1 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img1 = base64.b64decode(ss1['data'])
            with open(SCREENSHOT_64A, 'wb') as f:
                f.write(img1)
            print(f"Captured 64a (Stomach Cutaway along Red Line): {len(img1)} bytes", flush=True)
            
            # -------------------------------------------------------------
            # TEST 2: Duodenum Cutaway along C-loop Red Line Landmarks
            # -------------------------------------------------------------
            print("Step 2: Selecting Duodenum in Isolated Tab with Cutaway...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="duodenum"]');
                    if (pin) pin.click();
                    window.__DIGESTIVE_APP__?.dissectionVM?.setState({ isIsolateMode: true, isCutawayOpen: true });
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            ss2 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img2 = base64.b64decode(ss2['data'])
            with open(SCREENSHOT_64B, 'wb') as f:
                f.write(img2)
            print(f"Captured 64b (Duodenum Cutaway along C-loop Red Line): {len(img2)} bytes", flush=True)
            
            # -------------------------------------------------------------
            # TEST 3: Duodenum Thermal Heatmap (Hot -> Cold: D1 Red -> D4 Violet)
            # -------------------------------------------------------------
            print("Step 3: Switching to Heatmap Mode for Duodenum (Hot -> Cold)...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    document.getElementById('label-mode-regions')?.click();
                    window.__DIGESTIVE_APP__?.dissectionVM?.setState({ isCutawayOpen: false });
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            duo_eval = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const sceneView = window.__DIGESTIVE_APP__?.sceneView;
                    const duoMesh = sceneView?.stomachBuilder?.organLayersMap?.get('duodenum')?.[0];
                    const duoCol = duoMesh?.geometry?.attributes?.color?.array;
                    return {
                        hasColors: !!duoCol,
                        sampleColors: duoCol ? [
                            [duoCol[0], duoCol[1], duoCol[2]],
                            [duoCol[100], duoCol[101], duoCol[102]]
                        ] : null
                    };
                })()''',
                'returnByValue': True
            })
            print("DUODENUM THERMAL HEATMAP EVAL:", json.dumps(duo_eval.get('result', {}).get('value', {}), indent=2))
            
            ss3 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img3 = base64.b64decode(ss3['data'])
            with open(SCREENSHOT_64C, 'wb') as f:
                f.write(img3)
            print(f"Captured 64c (Duodenum Thermal Heatmap Hot->Cold): {len(img3)} bytes", flush=True)
            
            # -------------------------------------------------------------
            # TEST 4: Stomach Thermal Heatmap (Hot -> Cold: Fundus Red -> Pylorus Violet)
            # -------------------------------------------------------------
            print("Step 4: Selecting Stomach in Heatmap Mode (Hot -> Cold)...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="stomach"]');
                    if (pin) pin.click();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            ss4 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img4 = base64.b64decode(ss4['data'])
            with open(SCREENSHOT_64D, 'wb') as f:
                f.write(img4)
            print(f"Captured 64d (Stomach Thermal Heatmap Hot->Cold): {len(img4)} bytes", flush=True)
            
            # -------------------------------------------------------------
            # TEST 5: Pancreas Thermal Heatmap (Hot -> Cold: Head Red -> Tail Violet)
            # -------------------------------------------------------------
            print("Step 5: Selecting Pancreas in Heatmap Mode (Hot -> Cold)...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="pancreas"]');
                    if (pin) pin.click();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            ss5 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img5 = base64.b64decode(ss5['data'])
            with open(SCREENSHOT_64E, 'wb') as f:
                f.write(img5)
            print(f"Captured 64e (Pancreas Thermal Heatmap Hot->Cold): {len(img5)} bytes", flush=True)
            
            listen_task.cancel()
            print("ALL V12 THERMAL & RED LINE TESTS FINISHED SUCCESSFULLY!", flush=True)
            
    except Exception:
        traceback.print_exc()
    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(main())
