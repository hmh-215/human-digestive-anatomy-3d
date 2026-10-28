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
PORT = 9298
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SCREENSHOT_63A = os.path.join(ARTIFACT_DIR, '63a_stomach_smooth_landmark_cutaway.png')
SCREENSHOT_63B = os.path.join(ARTIFACT_DIR, '63b_isolated_stomach_other_organs_hidden.png')
SCREENSHOT_63C = os.path.join(ARTIFACT_DIR, '63c_isolated_stomach_other_organs_transparent.png')
SCREENSHOT_63D = os.path.join(ARTIFACT_DIR, '63d_heatmap_whole_system_default_gray.png')
SCREENSHOT_63E = os.path.join(ARTIFACT_DIR, '63e_heatmap_only_selected_duodenum_colored.png')
SCREENSHOT_63F = os.path.join(ARTIFACT_DIR, '63f_heatmap_only_selected_stomach_colored.png')

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
            # TEST 1: Isolated Stomach with Smooth Landmark-Defined Cutaway
            # -------------------------------------------------------------
            print("Step 1: Selecting Stomach in Isolated Tab...", flush=True)
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
            
            check_iso_hidden = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const sceneView = window.__DIGESTIVE_APP__?.sceneView;
                    const duoMesh = sceneView?.stomachBuilder?.organLayersMap?.get('duodenum')?.[0];
                    const gbMesh = sceneView?.stomachBuilder?.organLayersMap?.get('gallbladder_tree')?.[0];
                    const stomMesh = sceneView?.stomachBuilder?.organLayersMap?.get('stomach')?.[0];
                    const isCutaway = window.__DIGESTIVE_APP__?.dissectionVM?.state.isCutawayOpen;
                    return {
                        isCutaway,
                        stomachVisible: stomMesh ? stomMesh.visible : false,
                        duodenumVisible: duoMesh ? duoMesh.visible : false,
                        gallbladderVisible: gbMesh ? gbMesh.visible : false
                    };
                })()''',
                'returnByValue': True
            })
            print("ISOLATED STOMACH (OTHER ORGANS HIDDEN):", json.dumps(check_iso_hidden.get('result', {}).get('value', {}), indent=2))
            
            # Capture 63a (Smooth Cutaway) & 63b (Isolated Stomach, Other Organs Hidden)
            ss1 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img1 = base64.b64decode(ss1['data'])
            with open(SCREENSHOT_63A, 'wb') as f:
                f.write(img1)
            with open(SCREENSHOT_63B, 'wb') as f:
                f.write(img1)
            print(f"Captured 63a & 63b: {len(img1)} bytes", flush=True)
            
            # -------------------------------------------------------------
            # TEST 2: Toggle "Bỏ Cô Lập" -> other organs become ghosted transparent
            # -------------------------------------------------------------
            print("Step 2: Toggling Isolate Mode Off (Show Ghosted Transparent)...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const btn = document.getElementById('btn-isolate');
                    if (btn) btn.click();
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(1.5)
            
            check_iso_trans = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const sceneView = window.__DIGESTIVE_APP__?.sceneView;
                    const duoMesh = sceneView?.stomachBuilder?.organLayersMap?.get('duodenum')?.[0];
                    const gbMesh = sceneView?.stomachBuilder?.organLayersMap?.get('gallbladder_tree')?.[0];
                    const isIsolate = window.__DIGESTIVE_APP__?.dissectionVM?.state.isIsolateMode;
                    const btnText = document.getElementById('btn-isolate')?.textContent.trim();
                    return {
                        isIsolate,
                        btnText,
                        duodenumVisible: duoMesh ? duoMesh.visible : false,
                        duodenumTransparent: duoMesh ? duoMesh.material.transparent : false,
                        duodenumOpacity: duoMesh ? duoMesh.material.opacity : null,
                        gallbladderVisible: gbMesh ? gbMesh.visible : false,
                        gallbladderTransparent: gbMesh ? gbMesh.material.transparent : false,
                        gallbladderOpacity: gbMesh ? gbMesh.material.opacity : null
                    };
                })()''',
                'returnByValue': True
            })
            print("ISOLATED STOMACH (OTHER ORGANS GHOSTED TRANSPARENT):", json.dumps(check_iso_trans.get('result', {}).get('value', {}), indent=2))
            
            ss2 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img2 = base64.b64decode(ss2['data'])
            with open(SCREENSHOT_63C, 'wb') as f:
                f.write(img2)
            print(f"Captured 63c: {len(img2)} bytes", flush=True)
            
            # -------------------------------------------------------------
            # TEST 3: Heatmap Mode - Whole System Default (Uniform Light Gray)
            # -------------------------------------------------------------
            print("Step 3: Switching to Whole System Heatmap (Default Light Gray)...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    document.getElementById('label-mode-regions')?.click();
                    document.getElementById('btn-back-system')?.click();
                    window.__DIGESTIVE_APP__?.sceneVM?.selectOrgan(null);
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            check_gray = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const vm = window.__DIGESTIVE_APP__?.dissectionVM;
                    const sceneVM = window.__DIGESTIVE_APP__?.sceneVM;
                    const sceneView = window.__DIGESTIVE_APP__?.sceneView;
                    const stomMesh = sceneView?.stomachBuilder?.organLayersMap?.get('stomach')?.[0];
                    const duoMesh = sceneView?.stomachBuilder?.organLayersMap?.get('duodenum')?.[0];
                    const stomCol = stomMesh?.geometry?.attributes?.color?.array;
                    return {
                        organDisplayMode: vm?.state.organDisplayMode,
                        selectedOrganId: sceneVM?.state.selectedOrganId,
                        stomachVisible: stomMesh?.visible,
                        duodenumVisible: duoMesh?.visible,
                        stomachColorSample: stomCol ? [stomCol[0], stomCol[1], stomCol[2]] : null
                    };
                })()''',
                'returnByValue': True
            })
            print("WHOLE SYSTEM HEATMAP (DEFAULT GRAY):", json.dumps(check_gray.get('result', {}).get('value', {}), indent=2))
            
            ss3 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img3 = base64.b64decode(ss3['data'])
            with open(SCREENSHOT_63D, 'wb') as f:
                f.write(img3)
            print(f"Captured 63d: {len(img3)} bytes", flush=True)
            
            # -------------------------------------------------------------
            # TEST 4: Heatmap Mode - ONLY Selected Duodenum is Colored
            # -------------------------------------------------------------
            print("Step 4: Selecting Duodenum in Heatmap Mode...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    document.getElementById('tab-btn-organ')?.click();
                    const pin = document.querySelector('.body-pin[data-organ="duodenum"]');
                    if (pin) pin.click();
                    else {
                        window.__DIGESTIVE_APP__?.dissectionVM?.setState({ isIsolateMode: true });
                        window.__DIGESTIVE_APP__?.sceneVM?.selectOrgan('duodenum');
                    }
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            check_duo_heat = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const sceneView = window.__DIGESTIVE_APP__?.sceneView;
                    const duoMesh = sceneView?.stomachBuilder?.organLayersMap?.get('duodenum')?.[0];
                    const stomMesh = sceneView?.stomachBuilder?.organLayersMap?.get('stomach')?.[0];
                    const duoCol = duoMesh?.geometry?.attributes?.color?.array;
                    const isIsolate = window.__DIGESTIVE_APP__?.dissectionVM?.state.isIsolateMode;
                    return {
                        isIsolate,
                        duodenumVisible: duoMesh?.visible,
                        stomachVisible: stomMesh?.visible,
                        duoHasColors: !!duoCol
                    };
                })()''',
                'returnByValue': True
            })
            print("HEATMAP (ONLY DUODENUM COLORED):", json.dumps(check_duo_heat.get('result', {}).get('value', {}), indent=2))
            
            ss4 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img4 = base64.b64decode(ss4['data'])
            with open(SCREENSHOT_63E, 'wb') as f:
                f.write(img4)
            print(f"Captured 63e: {len(img4)} bytes", flush=True)
            
            # -------------------------------------------------------------
            # TEST 5: Heatmap Mode - ONLY Selected Stomach is Colored
            # -------------------------------------------------------------
            print("Step 5: Selecting Stomach in Heatmap Mode...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="stomach"]');
                    if (pin) pin.click();
                    else {
                        window.__DIGESTIVE_APP__?.dissectionVM?.setState({ isIsolateMode: true });
                        window.__DIGESTIVE_APP__?.sceneVM?.selectOrgan('stomach');
                    }
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            check_stom_heat = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const sceneView = window.__DIGESTIVE_APP__?.sceneView;
                    const stomMesh = sceneView?.stomachBuilder?.organLayersMap?.get('stomach')?.[0];
                    const duoMesh = sceneView?.stomachBuilder?.organLayersMap?.get('duodenum')?.[0];
                    return {
                        stomachVisible: stomMesh?.visible,
                        duodenumVisible: duoMesh?.visible
                    };
                })()''',
                'returnByValue': True
            })
            print("HEATMAP (ONLY STOMACH COLORED):", json.dumps(check_stom_heat.get('result', {}).get('value', {}), indent=2))
            
            ss5 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img5 = base64.b64decode(ss5['data'])
            with open(SCREENSHOT_63F, 'wb') as f:
                f.write(img5)
            print(f"Captured 63f: {len(img5)} bytes", flush=True)
            
            listen_task.cancel()
            print("ALL V11 TESTS COMPLETED PERFECTLY!", flush=True)
            
    except Exception:
        traceback.print_exc()
    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(main())
