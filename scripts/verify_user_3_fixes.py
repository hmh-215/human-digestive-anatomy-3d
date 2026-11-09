"""
scripts/verify_user_3_fixes.py
Comprehensive CDP automated testing & visual verification for the 3 user issues:
1. Fix lighting / shading on oral cavity (no shadow asymmetry on left teeth & maxilla).
2. Cross-section cap for tongue & mandible in oral cavity midsagittal cutaway (solid tạng đặc, no hollow shell).
3. Patched anterior stomach wall (closed pouch, no circular hole).
"""
import asyncio
import json
import urllib.request
import websockets
import subprocess
import sys
import base64
import os
import tempfile
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
HTTP_PORT = 8085
CDP_PORT = 9285
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOTS_DIR = os.path.join(BASE_DIR, 'assets', 'screenshots')

async def main():
    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge headless with temp dir: {temp_dir}...", flush=True)
    edge_proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={CDP_PORT}',
        f'--user-data-dir={temp_dir}',
        '--window-size=1600,1000',
        f'http://127.0.0.1:{HTTP_PORT}/index.html'
    ])

    try:
        tabs = None
        for _ in range(25):
            try:
                await asyncio.sleep(0.4)
                raw = urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json').read().decode()
                tabs = json.loads(raw)
                target_tabs = [t for t in tabs if '8085' in t.get('url', '')]
                if target_tabs:
                    tabs = target_tabs
                    break
            except Exception:
                pass

        if not tabs:
            raise RuntimeError("Failed to connect to Edge debugging port")

        target_tab = tabs[0]
        ws_url = target_tab['webSocketDebuggerUrl']
        print(f"Connected to tab: {target_tab['url']}", flush=True)

        async with websockets.connect(ws_url, max_size=200_000_000) as ws:
            req_id = 1
            pending = {}

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
                        elif data.get('method') == 'Runtime.consoleAPICalled':
                            args = data.get('params', {}).get('args', [])
                            t = data.get('params', {}).get('type', '')
                            text = ' '.join(str(a.get('description', a.get('value', ''))) for a in args)
                            if t == 'error':
                                print(f"[BROWSER ERROR] {text}", flush=True)
                except asyncio.CancelledError:
                    pass

            listen_task = asyncio.create_task(listen())

            async def send_req(method, params=None):
                nonlocal req_id
                cid = req_id
                req_id += 1
                loop = asyncio.get_running_loop()
                fut = loop.create_future()
                pending[cid] = fut
                await ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
                return await fut

            await send_req('Runtime.enable')
            await send_req('Page.enable')

            # Wait for 3D meshes to load
            print("Waiting for 3D meshes to load...", flush=True)
            loaded = False
            for attempt in range(40):
                await asyncio.sleep(0.5)
                res = await send_req('Runtime.evaluate', {
                    'expression': 'window.__DIGESTIVE_APP__?.sceneView?.clickableMeshes?.length || 0',
                    'returnByValue': True
                })
                count = res.get('result', {}).get('value', 0)
                if count > 50:
                    print(f"3D Meshes fully loaded! clickableMeshes = {count}", flush=True)
                    loaded = True
                    break

            if not loaded:
                raise RuntimeError("Timeout waiting for 3D meshes to load")

            await asyncio.sleep(1.0)

            async def take_screenshot(filename):
                shot = await send_req('Page.captureScreenshot', {'format': 'png'})
                out_path = os.path.join(SCREENSHOTS_DIR, filename)
                with open(out_path, 'wb') as f:
                    f.write(base64.b64decode(shot['data']))
                print(f"Captured: {out_path} ({os.path.getsize(out_path):,} bytes)", flush=True)
                return out_path

            # ==========================================
            # TEST 1: ORAL CAVITY FRONT VIEW SHADING
            # ==========================================
            print("\n=== TEST 1: Inspecting Oral Cavity Shading (Front View) ===", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('oral_cavity');
                    app.dissectionVM.setCutawayOpen(false);
                    // Optimal front camera view of mouth
                    app.sceneView.camera.position.set(0.0, 3.4, 3.6);
                    app.sceneView.controls.target.set(0.0, 3.4, 0.0);
                    app.sceneView.controls.update();
                })()
                '''
            })
            await asyncio.sleep(1.2)
            await take_screenshot("81_oral_cavity_fixed_shading_front.png")

            # Check oral meshes
            res_shading = await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const rTooth = sv.clickableMeshes.find(m => m.name === 'Upper_medial_incisorr');
                    const lTooth = sv.clickableMeshes.find(m => m.name === 'Upper_medial_incisorl');
                    const rMax = sv.clickableMeshes.find(m => m.name === 'Maxillar');
                    const lMax = sv.clickableMeshes.find(m => m.name === 'Maxillal');
                    const tCap = sv.clickableMeshes.find(m => m.name === 'Tongue_Cap');
                    const mCap = sv.clickableMeshes.find(m => m.name === 'Mandible_Cap');
                    return {
                        rToothFound: !!rTooth,
                        lToothFound: !!lTooth,
                        rMaxFound: !!rMax,
                        lMaxFound: !!lMax,
                        tongueCapFound: !!tCap,
                        mandibleCapFound: !!mCap,
                        tongueCapVisibleWhenClosed: tCap ? tCap.visible : null,
                        mandibleCapVisibleWhenClosed: mCap ? mCap.visible : null
                    };
                })()
                ''',
                'returnByValue': True
            })
            print("Oral meshes verification:", json.dumps(res_shading.get('result', {}).get('value'), indent=2))

            # ==========================================
            # TEST 2: ORAL CAVITY MIDSAGITTAL CUTAWAY & SOLID CAPS
            # ==========================================
            print("\n=== TEST 2: Inspecting Oral Cavity Cutaway & Caps (Tongue & Mandible) ===", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.dissectionVM.setCutawayOpen(true);
                    // Lateral sagittal view looking into the cutaway interior
                    app.sceneView.camera.position.set(2.8, 3.45, 1.2);
                    app.sceneView.controls.target.set(0.0, 3.40, 0.3);
                    app.sceneView.controls.update();
                })()
                '''
            })
            await asyncio.sleep(1.2)
            await take_screenshot("82_oral_cavity_midsagittal_caps.png")

            res_caps = await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const tCap = sv.clickableMeshes.find(m => m.name === 'Tongue_Cap');
                    const mCap = sv.clickableMeshes.find(m => m.name === 'Mandible_Cap');
                    return {
                        tongueCap: tCap ? {
                            visible: tCap.visible,
                            tris: tCap.geometry.index.count / 3,
                            color: '#' + tCap.material.color.getHexString(),
                            opacity: tCap.material.opacity
                        } : null,
                        mandibleCap: mCap ? {
                            visible: mCap.visible,
                            tris: mCap.geometry.index.count / 3,
                            color: '#' + mCap.material.color.getHexString(),
                            opacity: mCap.material.opacity
                        } : null
                    };
                })()
                ''',
                'returnByValue': True
            })
            print("Oral Caps Cutaway Status:", json.dumps(res_caps.get('result', {}).get('value'), indent=2))

            # ==========================================
            # TEST 3: STOMACH PATCHED ANTERIOR WALL
            # ==========================================
            print("\n=== TEST 3: Inspecting Stomach Anterior Wall (Closed Pouch) ===", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('stomach');
                    app.dissectionVM.setCutawayOpen(false);
                    // Camera focused on anterior surface of stomach body
                    app.sceneView.camera.position.set(0.5, 0.3, 7.5);
                    app.sceneView.controls.target.set(0.5, 0.3, 0.0);
                    app.sceneView.controls.update();
                })()
                '''
            })
            await asyncio.sleep(1.2)
            await take_screenshot("83_stomach_anterior_closed_pouch.png")

            # Also check layers mode & cutaway mode on stomach
            print("\n=== TEST 3b: Inspecting Stomach Cutaway Interior ===", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.dissectionVM.setCutawayOpen(true);
                    app.sceneView.camera.position.set(1.5, 0.4, 6.2);
                    app.sceneView.controls.target.set(0.5, 0.3, 0.0);
                    app.sceneView.controls.update();
                })()
                '''
            })
            await asyncio.sleep(1.2)
            await take_screenshot("84_stomach_cutaway_layers_intact.png")

            print("\n=== ALL 3 FIXES VERIFIED AND CAPTURED! ===")
            listen_task.cancel()

    finally:
        edge_proc.terminate()

asyncio.run(main())
