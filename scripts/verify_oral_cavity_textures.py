import asyncio
import json
import urllib.request
import websockets
import subprocess
import sys
import base64
import os
import tempfile
import http.server
import threading
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
HTTP_PORT = 8085
CDP_PORT = 9297
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOTS_DIR = os.path.join(BASE_DIR, 'assets', 'screenshots')

class CustomHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', HTTP_PORT), CustomHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server

async def main():
    print(f"Starting HTTP server on http://127.0.0.1:{HTTP_PORT}...", flush=True)
    http_srv = start_server()

    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge headless with temp dir: {temp_dir}...", flush=True)
    edge_proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={CDP_PORT}',
        f'--user-data-dir={temp_dir}',
        '--window-size=1600,1000',
        'about:blank'
    ])

    try:
        tabs = None
        for attempt in range(25):
            try:
                await asyncio.sleep(0.4)
                raw = urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json').read().decode()
                tabs = json.loads(raw)
                if tabs:
                    break
            except Exception:
                pass
                
        if not tabs:
            raise RuntimeError("Failed to connect to Edge debugging port")
            
        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url, max_size=200_000_000) as ws:
            req_id = 1
            pending = {}
            loop = asyncio.get_running_loop()
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
                                print(f"[CONSOLE ERROR] {text}", flush=True)
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
            
            nav_url = f'http://127.0.0.1:{HTTP_PORT}/index.html'
            print(f"Navigating to {nav_url}...", flush=True)
            await send_req('Page.navigate', {'url': nav_url})

            # Wait for 3D meshes to load
            loaded = False
            for _ in range(35):
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

            await asyncio.sleep(2.0)

            # Inspect Oral Cavity structures and texture bindings
            eval_js = """
            (() => {
                const sv = window.__DIGESTIVE_APP__.sceneView;
                const meshes = sv.clickableMeshes.filter(m => m.userData.organId === 'oral_cavity');

                const sampleParts = ['Tongue', 'Gingiva', 'Soft_palate', 'Laryngopharynx', 'Parotid_glandr', 'Mandible', 'Upper_medial_incisorl'];
                const results = {};

                sampleParts.forEach(pName => {
                    const m = meshes.find(x => x.name.toLowerCase().includes(pName.toLowerCase()));
                    if (m) {
                        results[pName] = {
                            found: true,
                            name: m.name,
                            subPart: m.userData.oralSubPart,
                            hasUV: !!m.geometry.attributes.uv,
                            uvCount: m.geometry.attributes.uv ? m.geometry.attributes.uv.count : 0,
                            map: m.material.map ? m.material.map.image?.src || 'loaded' : null,
                            roughness: m.material.roughness,
                            transparent: m.material.transparent,
                            opacity: m.material.opacity
                        };
                    } else {
                        results[pName] = { found: false };
                    }
                });

                return {
                    totalOralMeshes: meshes.length,
                    samples: results
                };
            })()
            """
            inspect_res = await send_req('Runtime.evaluate', {
                'expression': eval_js,
                'returnByValue': True
            })
            report = inspect_res.get('result', {}).get('value', {})
            print("\n=== ORAL CAVITY & PHARYNX 3D TEXTURE INSPECTION REPORT ===")
            print(json.dumps(report, indent=2, ensure_ascii=False))

            async def take_screenshot(name):
                shot_path = os.path.join(SCREENSHOTS_DIR, name)
                shot_res = await send_req("Page.captureScreenshot", {"format": "png"})
                b64 = shot_res.get("data")
                if b64:
                    with open(shot_path, "wb") as f:
                        f.write(base64.b64decode(b64))
                    print(f"Captured: {shot_path} ({os.path.getsize(shot_path):,} bytes)", flush=True)

            # 1. Select Oral Cavity (isolated mode)
            print("\nSelecting Oral Cavity (Vùng Miệng)...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': """
                window.__DIGESTIVE_APP__.sceneVM.selectOrgan('oral_cavity');
                window.__DIGESTIVE_APP__.dissectionVM.setIsolateMode(true);
                """
            })
            await asyncio.sleep(1.2)
            await take_screenshot("51_oral_cavity_full_pbr_textures.png")

            # 2. Enable 50% Midsagittal Cutaway for Oral Cavity
            print("\nEnabling 50% Midsagittal Cutaway on Oral Cavity...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': """
                window.__DIGESTIVE_APP__.dissectionVM.setCutawayOpen(true);
                """
            })
            await asyncio.sleep(1.2)
            await take_screenshot("52_oral_cavity_midsagittal_cutaway_textures.png")

            # 3. Rotate camera slightly to see tongue, palate, and pharyngeal interior
            print("\nAdjusting camera angle for interior view...", flush=True)
            await send_req('Runtime.evaluate', {
                'expression': """
                const sv = window.__DIGESTIVE_APP__.sceneView;
                sv.camera.position.set(1.5, 3.8, 4.2);
                sv.controls.target.set(0.0, 3.5, 0.2);
                sv.controls.update();
                """
            })
            await asyncio.sleep(1.0)
            await take_screenshot("53_oral_cavity_interior_detail.png")

            print(f"\nTotal Console errors: {len(console_errors)}")
            listen_task.cancel()

    finally:
        try:
            edge_proc.terminate()
            edge_proc.wait(timeout=3)
        except Exception:
            try:
                edge_proc.kill()
            except Exception:
                pass

        try:
            http_srv.shutdown()
        except Exception:
            pass

if __name__ == '__main__':
    asyncio.run(main())
