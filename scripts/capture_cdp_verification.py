import asyncio
import json
import urllib.request
import websockets
import subprocess
import sys
import base64
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9288
URL = 'http://localhost:8085/index.html'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'
SS_A = os.path.join(ARTIFACT_DIR, '61_clinical_anatomical_body_map_minimalist.png')
SS_B = os.path.join(ARTIFACT_DIR, '61b_clinical_categorized_list_minimalist.png')

async def main():
    print("Launching Edge...", flush=True)
    proc = subprocess.Popen([
        EDGE_PATH,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--window-size=1600,1000',
        'about:blank'
    ])
    try:
        await asyncio.sleep(2.0)
        tabs = json.loads(urllib.request.urlopen(f'http://localhost:{PORT}/json').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        
        async with websockets.connect(ws_url, max_size=30*1024*1024) as ws:
            await ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
            await ws.send(json.dumps({'id': 2, 'method': 'Page.enable'}))
            await ws.send(json.dumps({'id': 3, 'method': 'Page.navigate', 'params': {'url': URL}}))
            print("Navigating to index.html...", flush=True)
            
            # Drain navigation events for 4 seconds
            end_time = asyncio.get_event_loop().time() + 4.0
            while asyncio.get_event_loop().time() < end_time:
                try:
                    await asyncio.wait_for(ws.recv(), timeout=0.5)
                except asyncio.TimeoutError:
                    pass
            
            # 1. Switch to Organ Tab
            print("Switching to organ tab...", flush=True)
            await ws.send(json.dumps({
                'id': 10,
                'method': 'Runtime.evaluate',
                'params': {
                    'expression': "document.getElementById('tab-btn-organ')?.click();",
                    'returnByValue': True
                }
            }))
            
            # Drain until response 10
            for _ in range(20):
                msg = json.loads(await ws.recv())
                if msg.get('id') == 10:
                    break
            
            await asyncio.sleep(1.0)
            
            # 2. Inspect Body Pins
            await ws.send(json.dumps({
                'id': 20,
                'method': 'Runtime.evaluate',
                'params': {
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
                }
            }))
            
            for _ in range(20):
                msg = json.loads(await ws.recv())
                if msg.get('id') == 20:
                    val = msg.get('result', {}).get('result', {}).get('value', {})
                    print("PIN METRICS:")
                    print(json.dumps(val, indent=2, ensure_ascii=False), flush=True)
                    break
            
            # 3. Capture Screenshot A (Body Map)
            print("Capturing Screenshot A...", flush=True)
            await ws.send(json.dumps({'id': 30, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            for _ in range(20):
                msg = json.loads(await ws.recv())
                if msg.get('id') == 30:
                    img_bytes = base64.b64decode(msg['result']['data'])
                    with open(SS_A, 'wb') as f:
                        f.write(img_bytes)
                    print(f"Screenshot A saved: {len(img_bytes)} bytes", flush=True)
                    break
                    
            # 4. Switch to List View
            print("Switching to list view...", flush=True)
            await ws.send(json.dumps({
                'id': 40,
                'method': 'Runtime.evaluate',
                'params': {
                    'expression': "document.getElementById('btn-view-list')?.click();",
                    'returnByValue': True
                }
            }))
            for _ in range(20):
                msg = json.loads(await ws.recv())
                if msg.get('id') == 40:
                    break
                    
            await asyncio.sleep(0.5)
            
            # 5. Inspect List View
            await ws.send(json.dumps({
                'id': 50,
                'method': 'Runtime.evaluate',
                'params': {
                    'expression': '''(() => {
                        const listContainer = document.getElementById('organ-list-container');
                        const headers = Array.from(document.querySelectorAll('.category-header')).map(h => h.textContent.trim());
                        const chips = Array.from(listContainer.querySelectorAll('.organ-chip')).map(c => c.textContent.trim());
                        return { headers, chips };
                    })()''',
                    'returnByValue': True
                }
            }))
            for _ in range(20):
                msg = json.loads(await ws.recv())
                if msg.get('id') == 50:
                    val = msg.get('result', {}).get('result', {}).get('value', {})
                    print("LIST METRICS:")
                    print(json.dumps(val, indent=2, ensure_ascii=False), flush=True)
                    break
                    
            # 6. Capture Screenshot B (List View)
            print("Capturing Screenshot B...", flush=True)
            await ws.send(json.dumps({'id': 60, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            for _ in range(20):
                msg = json.loads(await ws.recv())
                if msg.get('id') == 60:
                    img_bytes = base64.b64decode(msg['result']['data'])
                    with open(SS_B, 'wb') as f:
                        f.write(img_bytes)
                    print(f"Screenshot B saved: {len(img_bytes)} bytes", flush=True)
                    break
                    
            print("All steps completed successfully!", flush=True)
    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(main())
