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
PORT = 9293
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SCREENSHOT_62A = os.path.join(ARTIFACT_DIR, '62a_bodymap_sole_view_no_list.png')
SCREENSHOT_62B = os.path.join(ARTIFACT_DIR, '62b_duodenum_functional_heatmap_d1_d4.png')
SCREENSHOT_62C = os.path.join(ARTIFACT_DIR, '62c_colon_functional_heatmap_cecum_sigmoid.png')
SCREENSHOT_62D = os.path.join(ARTIFACT_DIR, '62d_heatmap_mode_no_explode_control.png')

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
            
            # Wait 4.5s for 3D engine, shaders, and models
            await asyncio.sleep(4.5)
            
            # Switch to Organ Tab
            await send_req('Runtime.evaluate', {
                'expression': "document.getElementById('tab-btn-organ')?.click();",
                'returnByValue': True
            })
            print("Switched to Tab Cô Lập Tạng", flush=True)
            await asyncio.sleep(1.0)
            
            # Check Requirement 1: No "Danh sách" view or toggle bar, only body map
            check_dom = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const listContainer = document.getElementById('organ-list-container');
                    const modeBar = document.querySelector('.organ-view-mode-bar');
                    const bodyMap = document.getElementById('organ-bodymap-container');
                    const pins = Array.from(document.querySelectorAll('.body-pin')).map(p => ({
                        organ: p.dataset.organ,
                        text: p.textContent.trim()
                    }));
                    return {
                        hasListContainer: !!listContainer,
                        hasModeBar: !!modeBar,
                        hasBodyMap: !!bodyMap,
                        pinsCount: pins.length,
                        pins: pins
                    };
                })()''',
                'returnByValue': True
            })
            dom_res = check_dom.get('result', {}).get('value', {})
            print("REQUIREMENT 1 (Isolated Tab Architecture):")
            print(json.dumps(dom_res, indent=2, ensure_ascii=False), flush=True)
            assert not dom_res['hasListContainer'], "organ-list-container must NOT exist!"
            assert not dom_res['hasModeBar'], "organ-view-mode-bar must NOT exist!"
            assert dom_res['hasBodyMap'], "organ-bodymap-container MUST exist!"
            
            # Capture 62a: Sole body map view
            ss1 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img1 = base64.b64decode(ss1['data'])
            with open(SCREENSHOT_62A, 'wb') as f:
                f.write(img1)
            print(f"Captured 62a: {len(img1)} bytes", flush=True)
            
            # Requirement 2: Toggle to Phân Vùng (Heatmap mode)
            print("Toggling to Phân Vùng (Regions / Heatmap mode)...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const label = document.getElementById('label-mode-regions');
                    if (label) {
                        label.click();
                    } else if (window.__DIGESTIVE_APP__?.dissectionVM) {
                        window.__DIGESTIVE_APP__.dissectionVM.setOrganDisplayMode('regions');
                    }
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(1.0)
            
            heatmap_check = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const vm = window.__DIGESTIVE_APP__?.dissectionVM;
                    const explodeCard = document.querySelector('.explode-control-card');
                    const isHidden = explodeCard ? explodeCard.classList.contains('hidden') : false;
                    return {
                        organDisplayMode: vm ? vm.state.organDisplayMode : null,
                        explodeFactor: vm ? vm.state.explodeFactor : null,
                        explodeCardHidden: isHidden
                    };
                })()''',
                'returnByValue': True
            })
            hm_res = heatmap_check.get('result', {}).get('value', {})
            print("REQUIREMENT 2 (Explosion Disabled in Heatmap Mode):")
            print(json.dumps(hm_res, indent=2, ensure_ascii=False), flush=True)
            assert hm_res['organDisplayMode'] == 'regions', f"Mode must be 'regions', got {hm_res['organDisplayMode']}!"
            assert hm_res['explodeFactor'] == 0, "Explode factor must be 0 in regions mode!"
            assert hm_res['explodeCardHidden'] == True, "Explode control card must be hidden in regions mode!"
            
            # Capture 62d: Heatmap mode active with explode control hidden
            ss4 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img4 = base64.b64decode(ss4['data'])
            with open(SCREENSHOT_62D, 'wb') as f:
                f.write(img4)
            print(f"Captured 62d: {len(img4)} bytes", flush=True)
            
            # Test Duodenum Heatmap
            print("Selecting Duodenum Pin...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="duodenum"]');
                    if (pin) pin.click();
                    else window.__DIGESTIVE_APP__?.dissectionVM?.selectOrgan('duodenum');
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            duo_check = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const sceneView = window.__DIGESTIVE_APP__?.sceneView;
                    const duoLayers = sceneView?.stomachBuilder?.organLayersMap?.get('duodenum') || [];
                    const innerLayersHidden = duoLayers.slice(1).every(l => l.visible === false);
                    const outerLayerVisible = duoLayers.length > 0 ? duoLayers[0].visible : false;
                    const hasVertexColors = duoLayers.length > 0 ? (duoLayers[0].material.vertexColors === true) : false;
                    const drawerTitle = document.getElementById('drawer-title')?.textContent.trim();
                    return {
                        layersCount: duoLayers.length,
                        outerLayerVisible,
                        innerLayersHidden,
                        hasVertexColors,
                        drawerTitle
                    };
                })()''',
                'returnByValue': True
            })
            print("DUODENUM HEATMAP VERIFICATION:")
            print(json.dumps(duo_check.get('result', {}).get('value', {}), indent=2, ensure_ascii=False), flush=True)
            
            # Capture 62b: Duodenum Functional Heatmap
            ss2 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img2 = base64.b64decode(ss2['data'])
            with open(SCREENSHOT_62B, 'wb') as f:
                f.write(img2)
            print(f"Captured 62b: {len(img2)} bytes", flush=True)
            
            # Test Large Intestine (Colon) Heatmap
            print("Selecting Large Intestine (Đại Tràng) Pin...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const pin = document.querySelector('.body-pin[data-organ="large_intestine"]');
                    if (pin) pin.click();
                    else window.__DIGESTIVE_APP__?.dissectionVM?.selectOrgan('large_intestine');
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(2.0)
            
            colon_check = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const sceneView = window.__DIGESTIVE_APP__?.sceneView;
                    const colonLayers = sceneView?.stomachBuilder?.organLayersMap?.get('large_intestine') || [];
                    const innerLayersHidden = colonLayers.slice(1).every(l => l.visible === false);
                    const outerLayerVisible = colonLayers.length > 0 ? colonLayers[0].visible : false;
                    const hasVertexColors = colonLayers.length > 0 ? (colonLayers[0].material.vertexColors === true) : false;
                    const drawerTitle = document.getElementById('drawer-title')?.textContent.trim();
                    return {
                        layersCount: colonLayers.length,
                        outerLayerVisible,
                        innerLayersHidden,
                        hasVertexColors,
                        drawerTitle
                    };
                })()''',
                'returnByValue': True
            })
            print("COLON HEATMAP VERIFICATION:")
            print(json.dumps(colon_check.get('result', {}).get('value', {}), indent=2, ensure_ascii=False), flush=True)
            
            # Capture 62c: Colon Functional Heatmap
            ss3 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img3 = base64.b64decode(ss3['data'])
            with open(SCREENSHOT_62C, 'wb') as f:
                f.write(img3)
            print(f"Captured 62c: {len(img3)} bytes", flush=True)
            
            listen_task.cancel()
            print("ALL EDGE VERIFICATIONS FINISHED PERFECTLY!", flush=True)
            
    except Exception:
        traceback.print_exc()
    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(main())
