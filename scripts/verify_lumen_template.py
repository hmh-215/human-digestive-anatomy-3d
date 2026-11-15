import asyncio
import json
import urllib.request
import websockets
import subprocess
import base64
import os
import sys
import tempfile
import time

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
HTTP_PORT = 8099
CDP_PORT = 9330
URL = f'http://127.0.0.1:{HTTP_PORT}/index.html'

ROOT_DIR = r'd:\huong\antigravity\digestion_system_study'
SCREENSHOT_DIR = os.path.join(ROOT_DIR, 'assets', 'screenshots')
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

SHOT_3D = os.path.join(SCREENSHOT_DIR, '54_anatomy_theme_3d.png')
SHOT_HELP = os.path.join(SCREENSHOT_DIR, '55_anatomy_theme_help.png')
SHOT_DRAWER = os.path.join(SCREENSHOT_DIR, '56_anatomy_theme_drawer.png')
SHOT_LANDMARKS = os.path.join(SCREENSHOT_DIR, '57_clinical_landmarks_red_yellow_ring.png')

async def main():
    print(f"Starting HTTP server on port {HTTP_PORT}...", flush=True)
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(HTTP_PORT)],
        cwd=ROOT_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(1.0)

    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge on CDP port {CDP_PORT}...", flush=True)
    edge_proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={CDP_PORT}',
        f'--user-data-dir={temp_dir}',
        '--window-size=1600,1000',
        'about:blank'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        await asyncio.sleep(2.0)
        tabs_url = f'http://127.0.0.1:{CDP_PORT}/json'
        with urllib.request.urlopen(tabs_url) as resp:
            tabs = json.loads(resp.read().decode('utf-8'))
        ws_url = tabs[0]['webSocketDebuggerUrl']
        print(f"Connected to CDP WebSocket: {ws_url}", flush=True)

        async with websockets.connect(ws_url, max_size=25*1024*1024) as ws:
            loop = asyncio.get_running_loop()
            pending = {}
            req_id = 1

            async def send_cmd(method, params=None):
                nonlocal req_id
                cid = req_id
                req_id += 1
                fut = loop.create_future()
                pending[cid] = fut
                await ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
                return await fut

            async def bg_listener():
                try:
                    async for msg in ws:
                        d = json.loads(msg)
                        if 'id' in d and d['id'] in pending:
                            f = pending.pop(d['id'])
                            if 'error' in d:
                                f.set_exception(Exception(d['error']))
                            else:
                                f.set_result(d.get('result', {}))
                        elif d.get('method') == 'Runtime.consoleAPICalled':
                            args = d.get('params', {}).get('args', [])
                            txts = [str(a.get('value', a.get('description', ''))) for a in args]
                            print("  [Browser Console]", " ".join(txts), flush=True)
                except Exception:
                    pass

            listen_task = asyncio.create_task(bg_listener())

            await send_cmd("Page.enable")
            await send_cmd("Runtime.enable")

            print(f"Navigating to {URL}...", flush=True)
            await send_cmd("Page.navigate", {"url": URL})

            print("Waiting for app ready...", flush=True)
            for _ in range(40):
                await asyncio.sleep(0.5)
                res = await send_cmd("Runtime.evaluate", {
                    "expression": "Boolean(window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.organsGroup)"
                })
                if res.get("result", {}).get("value") is True:
                    print("App fully loaded and rendered!", flush=True)
                    break

            await asyncio.sleep(2.0)

            async def save_shot(path):
                shot = await send_cmd("Page.captureScreenshot", {"format": "png"})
                data = base64.b64decode(shot["data"])
                with open(path, "wb") as f:
                    f.write(data)
                print(f"[Screenshot] Saved: {path} ({len(data)} bytes)", flush=True)

            # Shot 1: Main 3D view with new anatomy-theme
            print("Capturing 54_anatomy_theme_3d.png...", flush=True)
            await save_shot(SHOT_3D)

            # Shot 2: Switch to Help Tab
            print("Clicking 'Trợ giúp' tab...", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": "document.getElementById('nav-btn-help').click()"
            })
            await asyncio.sleep(1.0)
            print("Capturing 55_anatomy_theme_help.png...", flush=True)
            await save_shot(SHOT_HELP)

            # Shot 3: Switch back to 3D and select stomach to verify isolated mode and drawer
            print("Selecting stomach and opening drawer...", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": "document.getElementById('nav-btn-3d').click(); window.__DIGESTIVE_APP__.sceneVM.selectOrgan('stomach');"
            })
            await asyncio.sleep(1.5)
            print("Capturing 56_anatomy_theme_drawer.png...", flush=True)
            await save_shot(SHOT_DRAWER)

            # Shot 4: Switch to Clinical Landmarks mode and verify mode pills + red/yellow markers
            print("Switching to Clinical Landmarks mode...", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": "document.querySelector('.mode-pill[data-mode=\"pathology\"]').click();"
            })
            await asyncio.sleep(2.5)
            pill_check = await send_cmd("Runtime.evaluate", {
                "expression": """JSON.stringify({
                    dissectionClasses: document.querySelector('.mode-pill[data-mode="dissection"]').className,
                    pathologyClasses: document.querySelector('.mode-pill[data-mode="pathology"]').className,
                    landmarksCount: window.__DIGESTIVE_APP__.sceneView.landmarkMarkers.size,
                    firstMarkerChildren: window.__DIGESTIVE_APP__.sceneView.landmarkMarkers.values().next().value.children.length
                })"""
            })
            print("Pill & Marker check:", pill_check.get("result", {}).get("value"), flush=True)
            print("Capturing 57_clinical_landmarks_red_yellow_ring.png...", flush=True)
            await save_shot(SHOT_LANDMARKS)

            listen_task.cancel()

    finally:
        print("Cleaning up Edge and Server processes...", flush=True)
        edge_proc.terminate()
        server_proc.terminate()
        try:
            edge_proc.wait(timeout=3)
            server_proc.wait(timeout=3)
        except:
            edge_proc.kill()
            server_proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
