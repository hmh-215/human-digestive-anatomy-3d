import asyncio
import json
import urllib.request
import websockets
import subprocess
import tempfile
import base64
import os

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9292
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'
SCREENSHOT_67D = os.path.join(ARTIFACT_DIR, '67d_pancreas_pastel_heatmap.png')

async def main():
    temp_dir = tempfile.mkdtemp()
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
        for _ in range(25):
            await asyncio.sleep(0.3)
            try:
                raw = urllib.request.urlopen(f'http://localhost:{PORT}/json').read().decode()
                tabs = json.loads(raw)
                if tabs: break
            except: pass
        ws_url = [t for t in tabs if t.get('type') == 'page'][0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
            req_id = 1
            pending = {}
            loop = asyncio.get_running_loop()
            async def listen():
                try:
                    async for msg in ws:
                        d = json.loads(msg)
                        cid = d.get('id')
                        if cid in pending:
                            pending.pop(cid).set_result(d.get('result', {}))
                except: pass
            asyncio.create_task(listen())
            async def send(method, params=None):
                nonlocal req_id
                cid = req_id
                req_id += 1
                fut = loop.create_future()
                pending[cid] = fut
                await ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
                return await fut

            await send('Runtime.enable')
            await send('Page.enable')
            await send('Page.navigate', {'url': URL})

            for _ in range(30):
                await asyncio.sleep(0.5)
                res = await send('Runtime.evaluate', {
                    'expression': 'window.__DIGESTIVE_APP__?.sceneView?.clickableMeshes?.length || 0',
                    'returnByValue': True
                })
                if res.get('result', {}).get('value', 0) > 100: break

            await send('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('pancreas');
                    app.dissectionVM.setOrganDisplayMode('regions');
                    app.dissectionVM.setIsolateMode(true);
                    app.sceneView.focusOrgan('pancreas');
                })()''',
                'returnByValue': True
            })
            await asyncio.sleep(1.5)

            shot = await send('Page.captureScreenshot', {'format': 'png'})
            b64 = shot.get('data')
            if b64:
                with open(SCREENSHOT_67D, 'wb') as f:
                    f.write(base64.b64decode(b64))
                print(f"Updated: {SCREENSHOT_67D} ({os.path.getsize(SCREENSHOT_67D):,} bytes)")
    finally:
        proc.terminate()
        try: proc.wait(timeout=2)
        except: proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
