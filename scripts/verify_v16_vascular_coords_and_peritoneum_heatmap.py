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
PORT = 9296
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_68A = os.path.join(ARTIFACT_DIR, '68a_vascular_liver_and_stomach_no_penetration.png')
SHOT_68B = os.path.join(ARTIFACT_DIR, '68b_peritoneum_isolated_pastel_heatmap.png')
SHOT_68C = os.path.join(ARTIFACT_DIR, '68c_stomach_cutaway_clean_vascular_interior.png')
SHOT_68D = os.path.join(ARTIFACT_DIR, '68d_hover_card_peritoneum_lesser_and_greater.png')
SHOT_68E = os.path.join(ARTIFACT_DIR, '68e_zoom_liver_stomach_comparison.png')

async def main():
    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge on port {PORT} with temp dir: {temp_dir}...", flush=True)
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
                if tabs:
                    break
            except Exception:
                pass
                
        if not tabs:
            raise RuntimeError("Failed to connect to Edge debugging port")
            
        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        print(f"Connected to Edge! Found {len(page_tabs)} page tabs", flush=True)

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

            loaded = False
            for attempt in range(40):
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

            await asyncio.sleep(1.2)

            async def capture_png(out_path, title):
                print(f"Capturing screenshot: {title} -> {out_path}...", flush=True)
                shot_res = await send_req("Page.captureScreenshot", {"format": "png"})
                b64 = shot_res.get("data")
                if b64:
                    with open(out_path, "wb") as f:
                        f.write(base64.b64decode(b64))
                    print(f"Saved: {out_path} ({os.path.getsize(out_path):,} bytes)", flush=True)

            # Test 1: Vascular alignment matching user's reference image
            print("\n--- Test 1: Vascular Coordinates (Liver & Stomach no penetration) ---", flush=True)
            res1 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan(null);
                    app.dissectionVM.setOrganDisplayMode('layers');
                    app.dissectionVM.setState({ isIsolateMode: false });
                    
                    // Match camera angle in media_1793176667529_c2b7980e.png
                    sv.camera.position.set(0.0, 1.2, 11.5);
                    sv.controls.target.set(0.0, 0.5, 0.2);
                    sv.controls.update();
                    
                    // Check vessels bounds
                    const properArtery = sv.clickableMeshes.find(m => m.name.includes('Proper_hepatic_artery') || m.name.includes('Proper hepatic artery'));
                    const leftGastro = sv.clickableMeshes.find(m => m.name.includes('Left_gastro-omental') || m.name.includes('Left gastro-omental'));
                    const rightGastro = sv.clickableMeshes.find(m => m.name.includes('Right_gastro-omental') || m.name.includes('Right gastro-omental'));
                    const ivc = sv.clickableMeshes.find(m => m.name.includes('Inferior_vena_cava') || m.name.includes('Inferior vena cava'));
                    const hepaticVeins = sv.clickableMeshes.find(m => m.name.includes('Hepatic_vein') || m.name.includes('Hepatic veins'));
                    
                    return {
                        properArteryFound: Boolean(properArtery),
                        leftGastroFound: Boolean(leftGastro),
                        rightGastroFound: Boolean(rightGastro),
                        ivcFound: Boolean(ivc),
                        hepaticVeinsFound: Boolean(hepaticVeins)
                    };
                })()
                """,
                "returnByValue": True
            })
            print("Vessels status:", json.dumps(res1.get("result", {}).get("value", {}), indent=2), flush=True)
            await asyncio.sleep(0.8)
            await capture_png(SHOT_68A, "68a: Liver & Stomach vascular coordinates - no penetration, no liver protrusion")

            # Capture close-up zoom matching user frame media_1793176667529_c2b7980e.png
            await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    sv.camera.position.set(0.0, 0.45, 6.8);
                    sv.controls.target.set(0.0, 0.25, 0.2);
                    sv.controls.update();
                })()
                """
            })
            await asyncio.sleep(0.6)
            await capture_png(SHOT_68E, "68e: Zoom-in view matching user screenshot media_1793176667529_c2b7980e.png")

            # Test 2: Peritoneum & Omentum Heatmap
            print("\n--- Test 2: Peritoneum Functional Heatmap ---", flush=True)
            res2 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan('peritoneum_omentum');
                    app.dissectionVM.setOrganDisplayMode('regions');
                    app.dissectionVM.setState({ isIsolateMode: true });
                    
                    sv.camera.position.set(0.0, 108.0, 38.0);
                    sv.controls.target.set(0.0, 104.0, 2.0);
                    sv.controls.update();
                    
                    const peritMeshes = sv.clickableMeshes.filter(m => m.userData.organId === 'peritoneum_omentum');
                    return {
                        selectedId: app.sceneVM.state.selectedOrganId,
                        displayMode: app.dissectionVM.state.organDisplayMode,
                        peritMeshCount: peritMeshes.length,
                        peritMeshes: peritMeshes.map(m => ({
                            name: m.name,
                            visible: m.visible,
                            vertexColors: Boolean(m.material && m.material.vertexColors),
                            opacity: m.material ? m.material.opacity : null
                        }))
                    };
                })()
                """,
                "returnByValue": True
            })
            print("Peritoneum Heatmap status:", json.dumps(res2.get("result", {}).get("value", {}), indent=2), flush=True)
            await asyncio.sleep(0.8)
            await capture_png(SHOT_68B, "68b: Peritoneum 4-region pastel functional heatmap")

            # Test 3: Stomach Coronal Cutaway with clean vascular discard
            print("\n--- Test 3: Stomach 50% Coronal Cutaway & Vascular Discard ---", flush=True)
            res3 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan('stomach');
                    app.dissectionVM.setOrganDisplayMode('layers');
                    app.dissectionVM.setCutawayOpen(true);
                    app.dissectionVM.setState({ isIsolateMode: true, explodeFactor: 0.0 });
                    
                    sv.camera.position.set(2.5, 114.5, 18.0);
                    sv.controls.target.set(2.5, 114.0, 4.0);
                    sv.controls.update();
                    
                    // Check if vascular cutaway active uniform is set to 1.0
                    const vMeshes = sv.clickableMeshes.filter(m => ['portal_system', 'hepatic_artery', 'hepatic_veins'].includes(m.userData.organId));
                    const uActiveVals = vMeshes.map(m => m.material?.userData?.uVesselCutActive?.value);
                    
                    return {
                        isCutawayOpen: app.dissectionVM.state.isCutawayOpen,
                        vesselMeshCount: vMeshes.length,
                        uVesselCutActiveFirst: uActiveVals[0]
                    };
                })()
                """,
                "returnByValue": True
            })
            print("Cutaway & Vascular Discard status:", json.dumps(res3.get("result", {}).get("value", {}), indent=2), flush=True)
            await asyncio.sleep(0.8)
            await capture_png(SHOT_68C, "68c: Stomach coronal cutaway with clean lumen")

            # Test 4: Hover Cards for Peritoneum (Lesser & Greater Omentum)
            print("\n--- Test 4: Hover Cards for Peritoneal Regions ---", flush=True)
            res4 = await send_req("Runtime.evaluate", {
                "expression": """
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.sceneVM.selectOrgan('peritoneum_omentum');
                    app.dissectionVM.setOrganDisplayMode('regions');
                    
                    const lesser = sv.clickableMeshes.find(m => m.name === 'Lesser_omentum');
                    const greater = sv.clickableMeshes.find(m => m.name === 'Greater_omentum');
                    const mesocolon = sv.clickableMeshes.find(m => m.name === 'Mesocolon');
                    const mesoApp = sv.clickableMeshes.find(m => m.name === 'Meso-appendix');
                    
                    const pLesser = lesser ? sv._buildHoverPayload(lesser, 400, 300) : null;
                    const pGreater = greater ? sv._buildHoverPayload(greater, 400, 500) : null;
                    const pMesocolon = mesocolon ? sv._buildHoverPayload(mesocolon, 400, 400) : null;
                    const pMesoApp = mesoApp ? sv._buildHoverPayload(mesoApp, 400, 600) : null;
                    
                    // Trigger actual hover callout display for Greater Omentum
                    if (greater && pGreater) {
                        sv.hoverCallout.update(pGreater);
                    }
                    
                    return {
                        pLesser,
                        pGreater,
                        pMesocolon,
                        pMesoApp
                    };
                })()
                """,
                "returnByValue": True
            })
            print("Hover Card metadata:", json.dumps(res4.get("result", {}).get("value", {}), indent=2, ensure_ascii=False), flush=True)
            await asyncio.sleep(0.8)
            await capture_png(SHOT_68D, "68d: Peritoneum hover card metadata displayed")

            listen_task.cancel()
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            pass

if __name__ == '__main__':
    asyncio.run(main())
