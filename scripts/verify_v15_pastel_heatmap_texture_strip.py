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
PORT = 9295
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SCREENSHOT_67A = os.path.join(ARTIFACT_DIR, '67a_whole_system_default_clean_gray.png')
SCREENSHOT_67B = os.path.join(ARTIFACT_DIR, '67b_stomach_luminous_pastel_heatmap.png')
SCREENSHOT_67C = os.path.join(ARTIFACT_DIR, '67c_duodenum_pastel_heatmap.png')
SCREENSHOT_67D = os.path.join(ARTIFACT_DIR, '67d_pancreas_pastel_heatmap.png')
SCREENSHOT_67E = os.path.join(ARTIFACT_DIR, '67e_switch_back_to_layers_textures_restored.png')

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

            async def capture_png(out_path, title):
                print(f"Capturing screenshot: {title} -> {out_path}...", flush=True)
                shot_res = await send_req("Page.captureScreenshot", {"format": "png"})
                b64 = shot_res.get("data")
                if b64:
                    with open(out_path, "wb") as f:
                        f.write(base64.b64decode(b64))
                    print(f"Saved: {out_path} ({os.path.getsize(out_path):,} bytes)", flush=True)
                else:
                    print("Failed to capture screenshot data", flush=True)

            # Step 1: Switch to Functional Heatmap Mode with Whole System (No organ selected)
            print("\n--- Test 1: Heatmap Mode - Whole System Clean Gray ---", flush=True)
            res1 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan(null);
                    app.dissectionVM.setOrganDisplayMode('regions');
                    app.dissectionVM.setState({ isIsolateMode: false });
                    
                    const stom = app.sceneView.stomachWallMeshes[0];
                    const mat = stom.material;
                    return {
                        organDisplayMode: app.dissectionVM.state.organDisplayMode,
                        hasMap: Boolean(mat.map),
                        hasBumpMap: Boolean(mat.bumpMap),
                        matRoughness: mat.roughness,
                        matColorHex: mat.color.getHexString(),
                        vertexColors: mat.vertexColors
                    };
                })()
                """,
                "returnByValue": True
            })
            val1 = res1.get("result", {}).get("value")
            print("Whole System Heatmap State:", json.dumps(val1, indent=2), flush=True)
            await asyncio.sleep(1.0)
            await capture_png(SCREENSHOT_67A, "67a_whole_system_default_clean_gray")

            # Step 2: Select & Isolate Stomach in Heatmap Mode
            print("\n--- Test 2: Isolate Stomach - Luminous Pastel Thermal Heatmap ---", flush=True)
            res2 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('stomach');
                    app.dissectionVM.setOrganDisplayMode('regions');
                    app.dissectionVM.setState({ isIsolateMode: true });
                    app.sceneView.focusStomach();
                    
                    const stom = app.sceneView.stomachWallMeshes[0];
                    const geo = stom.geometry;
                    const colors = geo.attributes.color ? geo.attributes.color.array : null;
                    const sampleColors = [];
                    if (colors) {
                        for (let i = 0; i < Math.min(10, geo.attributes.position.count); i += 2) {
                            sampleColors.push([
                                colors[i*3].toFixed(3),
                                colors[i*3+1].toFixed(3),
                                colors[i*3+2].toFixed(3)
                            ]);
                        }
                    }
                    return {
                        selectedOrgan: app.sceneVM.state.selectedOrganId,
                        isIsolateMode: app.dissectionVM.state.isIsolateMode,
                        hasMap: Boolean(stom.material.map),
                        hasBumpMap: Boolean(stom.material.bumpMap),
                        sampleColors
                    };
                })()
                """,
                "returnByValue": True
            })
            val2 = res2.get("result", {}).get("value")
            print("Stomach Heatmap State:", json.dumps(val2, indent=2), flush=True)
            await asyncio.sleep(1.2)
            await capture_png(SCREENSHOT_67B, "67b_stomach_luminous_pastel_heatmap")

            # Step 3: Select & Isolate Duodenum in Heatmap Mode
            print("\n--- Test 3: Isolate Duodenum - Luminous Pastel Thermal Heatmap ---", flush=True)
            res3 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('duodenum');
                    app.dissectionVM.setOrganDisplayMode('regions');
                    app.dissectionVM.setState({ isIsolateMode: true });
                    app.sceneView.focusDuodenum();
                    
                    const duod = app.sceneView.duodenumWallMeshes[0];
                    return {
                        selectedOrgan: app.sceneVM.state.selectedOrganId,
                        hasMap: Boolean(duod.material.map),
                        hasBumpMap: Boolean(duod.material.bumpMap)
                    };
                })()
                """,
                "returnByValue": True
            })
            val3 = res3.get("result", {}).get("value")
            print("Duodenum Heatmap State:", json.dumps(val3, indent=2), flush=True)
            await asyncio.sleep(1.2)
            await capture_png(SCREENSHOT_67C, "67c_duodenum_pastel_heatmap")

            # Step 4: Select & Isolate Pancreas in Heatmap Mode
            print("\n--- Test 4: Isolate Pancreas - Luminous Pastel Thermal Heatmap ---", flush=True)
            res4 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('pancreas');
                    app.dissectionVM.setOrganDisplayMode('regions');
                    app.dissectionVM.setState({ isIsolateMode: true });
                    app.sceneView.focusOrgan('pancreas');
                    
                    const panc = app.sceneView.clickableMeshes.find(m => m.userData.organId === 'pancreas' && !m.name.includes('duct'));
                    return {
                        selectedOrgan: app.sceneVM.state.selectedOrganId,
                        hasMap: panc && panc.material ? Boolean(panc.material.map) : null
                    };
                })()
                """,
                "returnByValue": True
            })
            val4 = res4.get("result", {}).get("value")
            print("Pancreas Heatmap State:", json.dumps(val4, indent=2), flush=True)
            await asyncio.sleep(1.2)
            await capture_png(SCREENSHOT_67D, "67d_pancreas_pastel_heatmap")

            # Step 5: Switch back to Histological Layers Mode ('layers')
            print("\n--- Test 5: Switch back to Layers Mode (Textures Restored) ---", flush=True)
            res5 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('stomach');
                    app.dissectionVM.setOrganDisplayMode('layers');
                    app.dissectionVM.setState({ isIsolateMode: true, isCutawayOpen: true });
                    app.sceneView.focusStomach();
                    
                    const stom = app.sceneView.stomachWallMeshes[0];
                    return {
                        organDisplayMode: app.dissectionVM.state.organDisplayMode,
                        hasMap: Boolean(stom.material.map),
                        hasBumpMap: Boolean(stom.material.bumpMap),
                        vertexColors: stom.material.vertexColors
                    };
                })()
                """,
                "returnByValue": True
            })
            val5 = res5.get("result", {}).get("value")
            print("Layers Mode Restored State:", json.dumps(val5, indent=2), flush=True)
            await asyncio.sleep(1.2)
            await capture_png(SCREENSHOT_67E, "67e_switch_back_to_layers_textures_restored")

            listen_task.cancel()

    finally:
        print("Terminating Edge headless process...", flush=True)
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
