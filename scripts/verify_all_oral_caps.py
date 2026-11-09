"""
scripts/verify_all_oral_caps.py
Verifies all 5 cross-section caps in oral cavity midsagittal cutaway:
1. Tongue_Cap (Lưỡi)
2. Mandible_Cap (Xương hàm dưới)
3. Palate_Cap (Khẩu cái mềm & Lưỡi gà)
4. Epiglottis_Cap (Nắp thanh môn)
5. Hyoid_Bone_Cap (Xương móng)
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

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
HTTP_PORT = 8085
CDP_PORT = 9286
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOTS_DIR = os.path.join(BASE_DIR, 'assets', 'screenshots')

async def main():
    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge headless on CDP port {CDP_PORT}...", flush=True)
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
            console_errors = []

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
                                console_errors.append(text)
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

            # Wait for 3D scene to load
            print("Waiting for 3D meshes to load...", flush=True)
            for _ in range(30):
                await asyncio.sleep(0.5)
                res = await send_req('Runtime.evaluate', {
                    'expression': '!!(window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.clickableMeshes && window.__DIGESTIVE_APP__.sceneView.clickableMeshes.length > 20)',
                    'returnByValue': True
                })
                if res.get('result', {}).get('value'):
                    break

            async def take_screenshot(filename):
                shot_data = await send_req('Page.captureScreenshot', {'format': 'png'})
                img_bytes = base64.b64decode(shot_data['data'])
                path = os.path.join(SCREENSHOTS_DIR, filename)
                with open(path, 'wb') as f:
                    f.write(img_bytes)
                print(f"  [SCREENSHOT SAVED] -> {path}", flush=True)
                return path

            # Select oral cavity
            print("\n[Step 1] Selecting oral_cavity in isolation mode...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('oral_cavity');
                    app.dissectionVM.setCutawayOpen(false);
                })()
                '''
            })
            await asyncio.sleep(1.0)

            # Check caps presence and status when cutaway is closed
            res_closed = await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const capNames = ['Tongue_Cap', 'Mandible_Cap', 'Palate_Cap', 'Epiglottis_Cap', 'Hyoid_Bone_Cap'];
                    const report = {};
                    capNames.forEach(name => {
                        const m = sv.clickableMeshes.find(x => x.name === name);
                        report[name] = m ? {
                            found: true,
                            visible: m.visible,
                            tris: m.geometry.index.count / 3,
                            subPart: m.userData.oralSubPart,
                            isOralCap: m.userData.isOralCap
                        } : { found: false };
                    });
                    return report;
                })()
                ''',
                'returnByValue': True
            })
            print("Caps status when Cutaway is CLOSED (all should be visible: false):")
            print(json.dumps(res_closed.get('result', {}).get('value'), indent=2))

            # Enable Cutaway
            print("\n[Step 2] Opening Midsagittal Cutaway for Oral Cavity...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.dissectionVM.setCutawayOpen(true);
                    // Lateral sagittal view looking into the cutaway interior (+X to -X)
                    app.sceneView.camera.position.set(2.8, 3.45, 1.2);
                    app.sceneView.controls.target.set(0.0, 3.40, 0.3);
                    app.sceneView.controls.update();
                })()
                '''
            })
            await asyncio.sleep(1.2)
            await take_screenshot("85_oral_all_caps_lateral_overview.png")

            res_open = await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const capNames = ['Tongue_Cap', 'Mandible_Cap', 'Palate_Cap', 'Epiglottis_Cap', 'Hyoid_Bone_Cap'];
                    const report = {};
                    capNames.forEach(name => {
                        const m = sv.clickableMeshes.find(x => x.name === name);
                        report[name] = m ? {
                            found: true,
                            visible: m.visible,
                            tris: m.geometry.index.count / 3,
                            color: '#' + m.material.color.getHexString(),
                            subPart: m.userData.oralSubPart,
                            isOralCap: m.userData.isOralCap
                        } : { found: false };
                    });
                    return report;
                })()
                ''',
                'returnByValue': True
            })
            print("\nCaps status when Cutaway is OPEN (all should be visible: true):")
            print(json.dumps(res_open.get('result', {}).get('value'), indent=2))

            # Step 3: Close up on Palate + Uvula
            print("\n[Step 3] Close-up screenshot of Palate & Uvula Cap...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    // Zoom into soft palate & uvula region
                    app.sceneView.camera.position.set(1.4, 3.75, 0.8);
                    app.sceneView.controls.target.set(0.0, 3.65, 0.4);
                    app.sceneView.controls.update();
                })()
                '''
            })
            await asyncio.sleep(1.0)
            await take_screenshot("86_palate_and_uvula_cap_detail.png")

            # Step 4: Close up on Epiglottis & Hyoid Bone
            print("\n[Step 4] Close-up screenshot of Epiglottis & Hyoid Bone Caps...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const app = window.__DIGESTIVE_APP__;
                    // Zoom into epiglottis & hyoid region
                    app.sceneView.camera.position.set(1.5, 3.10, 0.9);
                    app.sceneView.controls.target.set(0.0, 3.15, 0.5);
                    app.sceneView.controls.update();
                })()
                '''
            })
            await asyncio.sleep(1.0)
            await take_screenshot("87_epiglottis_and_hyoid_caps_detail.png")

            # Step 5: Test hover callout titles for each cap
            print("\n[Step 5] Testing hover titles for each oral cap...", flush=True)
            res_hover = await send_req('Runtime.evaluate', {
                'expression': '''
                (() => {
                    const sv = window.__DIGESTIVE_APP__.sceneView;
                    const capNames = ['Tongue_Cap', 'Mandible_Cap', 'Palate_Cap', 'Epiglottis_Cap', 'Hyoid_Bone_Cap'];
                    const titles = {};
                    capNames.forEach(name => {
                        const m = sv.clickableMeshes.find(x => x.name === name);
                        if (m) {
                            const data = sv._createCalloutData(m, 300, 300);
                            titles[name] = data ? data.title : 'N/A';
                        }
                    });
                    return titles;
                })()
                ''',
                'returnByValue': True
            })
            print("Hover Callout Titles:")
            print(json.dumps(res_hover.get('result', {}).get('value'), indent=2, ensure_ascii=False))

            print(f"\nTotal browser console errors: {len(console_errors)}")
            listen_task.cancel()

    finally:
        edge_proc.terminate()

if __name__ == '__main__':
    asyncio.run(main())
