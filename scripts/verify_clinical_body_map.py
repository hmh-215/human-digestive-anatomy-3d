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
PORT = 9291
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'
SCREENSHOT_PATH_A = os.path.join(ARTIFACT_DIR, '61_clinical_anatomical_body_map_minimalist.png')
SCREENSHOT_PATH_B = os.path.join(ARTIFACT_DIR, '61b_clinical_categorized_list_minimalist.png')

async def main():
    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge with user-data-dir: {temp_dir}...", flush=True)
    proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        f'--user-data-dir={temp_dir}',
        '--window-size=1600,1000',
        'about:blank'
    ])
    try:
        # Wait for debugging port to be ready
        tabs = None
        for attempt in range(20):
            try:
                await asyncio.sleep(0.5)
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
            
            # Wait for 3D and UI initialization
            await asyncio.sleep(4.0)
            
            # Switch to Organ Tab
            await send_req('Runtime.evaluate', {
                'expression': "document.getElementById('tab-btn-organ')?.click();",
                'returnByValue': True
            })
            print("Switched to organ tab", flush=True)
            await asyncio.sleep(1.0)
            
            # Check card and pins metrics
            pins_data = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const card = document.getElementById('organ-bodymap-container');
                    const cRect = card.getBoundingClientRect();
                    const pins = Array.from(document.querySelectorAll('.body-pin')).map(p => {
                        const r = p.getBoundingClientRect();
                        return {
                            text: p.textContent.trim(),
                            organ: p.dataset.organ,
                            leftRel: Math.round(r.left - cRect.left),
                            topRel: Math.round(r.top - cRect.top),
                            width: Math.round(r.width),
                            height: Math.round(r.height)
                        };
                    });
                    return {
                        cardWidth: Math.round(cRect.width),
                        cardHeight: Math.round(cRect.height),
                        pins: pins
                    };
                })()''',
                'returnByValue': True
            })
            val = pins_data.get('result', {}).get('value', {})
            print("PIN METRICS:")
            print(json.dumps(val, indent=2, ensure_ascii=False), flush=True)
            
            # Capture screenshot of Body Map
            ss1 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img1 = base64.b64decode(ss1['data'])
            with open(SCREENSHOT_PATH_A, 'wb') as f:
                f.write(img1)
            print(f"Saved Screenshot A: {len(img1)} bytes", flush=True)
            
            # Switch to List View
            await send_req('Runtime.evaluate', {
                'expression': "document.getElementById('btn-view-list')?.click();",
                'returnByValue': True
            })
            await asyncio.sleep(0.5)
            
            # Inspect List View
            list_data = await send_req('Runtime.evaluate', {
                'expression': '''(() => {
                    const listContainer = document.getElementById('organ-list-container');
                    const headers = Array.from(document.querySelectorAll('.category-header')).map(h => h.textContent.trim());
                    const chips = Array.from(listContainer.querySelectorAll('.organ-chip')).map(c => c.textContent.trim());
                    return { headers, chips };
                })()''',
                'returnByValue': True
            })
            print("LIST VIEW METRICS:")
            print(json.dumps(list_data.get('result', {}).get('value', {}), indent=2, ensure_ascii=False), flush=True)
            
            # Capture screenshot of List View
            ss2 = await send_req('Page.captureScreenshot', {'format': 'png'})
            img2 = base64.b64decode(ss2['data'])
            with open(SCREENSHOT_PATH_B, 'wb') as f:
                f.write(img2)
            print(f"Saved Screenshot B: {len(img2)} bytes", flush=True)
            
            listen_task.cancel()
            print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!", flush=True)
            
    except Exception:
        traceback.print_exc()
    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(main())
