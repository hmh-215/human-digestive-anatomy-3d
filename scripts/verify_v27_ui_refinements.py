import asyncio
import json
import urllib.request
import websockets
import subprocess
import base64
import os
import sys
import tempfile

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9314
URL = 'http://localhost:8080/index.html?v=20261109_v27'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_80A = os.path.join(ARTIFACT_DIR, '80a_top_nav_and_reset_view_button.png')
SHOT_80B = os.path.join(ARTIFACT_DIR, '80b_hover_card_seamlessly_connected_to_line.png')
SHOT_80C = os.path.join(ARTIFACT_DIR, '80c_justified_text_in_drawer.png')
SHOT_80D = os.path.join(ARTIFACT_DIR, '80d_reset_view_executed.png')

async def main():
    temp_dir = tempfile.mkdtemp()
    print(f"Launching Edge on port {PORT}...", flush=True)
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
                if tabs: break
            except Exception: pass
                
        if not tabs:
            raise RuntimeError("Failed to connect to Edge")

        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url, max_size=200_000_000) as ws:
            req_id = 1
            pending = {}
            loop = asyncio.get_running_loop()

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
                except Exception:
                    pass

            listen_task = asyncio.create_task(bg_listener())

            await send_cmd('Page.enable')
            await send_cmd('Runtime.enable')

            print(f"Navigating to {URL}...", flush=True)
            await send_cmd('Page.navigate', {'url': URL})

            # Wait for 3D scene loading
            for i in range(40):
                await asyncio.sleep(0.5)
                eval_res = await send_cmd('Runtime.evaluate', {
                    'expression': 'Boolean(window.__DIGESTIVE_APP__?.sceneView?.clickableMeshes?.length > 10)'
                })
                if eval_res.get('result', {}).get('value'):
                    print(f"3D Scene ready at attempt {i+1}!", flush=True)
                    break
            else:
                raise RuntimeError("Timeout waiting for 3D Scene")

            await asyncio.sleep(1.2)

            async def take_shot(filepath):
                shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
                with open(filepath, 'wb') as f:
                    f.write(base64.b64decode(shot['data']))
                print(f"Saved screenshot: {filepath}", flush=True)

            # TEST 1: Top Navigation Bar & Floating "Reset view" Button
            print("\n=== TEST 1: Top Navigation Bar & Reset View Button ===", flush=True)
            res1 = await send_cmd('Runtime.evaluate', {
                'returnByValue': True,
                'expression': '''(() => {
                    const navTabs = Array.from(document.querySelectorAll('.main-nav .nav-tab-btn')).map(b => b.textContent.trim());
                    const searchBar = document.getElementById('expandable-search');
                    const resetBtn = document.getElementById('btn-reset-camera');
                    const resetRect = resetBtn ? resetBtn.getBoundingClientRect() : null;
                    return {
                        navTabs,
                        searchBarExists: !!searchBar,
                        resetBtnText: resetBtn ? resetBtn.textContent.trim() : null,
                        resetBtnClass: resetBtn ? resetBtn.className : null,
                        resetBtnRect: resetRect ? { top: resetRect.top, right: resetRect.right, width: resetRect.width, height: resetRect.height } : null
                    };
                })()'''
            })
            info1 = res1.get('result', {}).get('value', {})
            print("Nav Tabs:", info1.get('navTabs'))
            print("Search bar exists:", info1.get('searchBarExists'))
            print("Reset View Button Text:", info1.get('resetBtnText'))
            print("Reset View Button Rect:", info1.get('resetBtnRect'))
            assert "Giải Phẫu" in info1.get('navTabs', [])
            assert "Điểm Mốc Lâm Sàng" in info1.get('navTabs', [])
            assert "Trợ Giúp" in info1.get('navTabs', [])
            assert not any("Mô hình 3D" in t for t in info1.get('navTabs', []))
            assert not info1.get('searchBarExists'), "Search bar should be removed!"
            assert "Reset view" in info1.get('resetBtnText', ''), "Reset button must say 'Reset view'!"
            await take_shot(SHOT_80A)

            # TEST 2: Hover Callout Seamless Connection
            print("\n=== TEST 2: Hover Callout Seamless Connection ===", flush=True)
            # Switch to isolated Stomach and hover
            await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.dissectionVM.setIsolateMode(true);
                    app.sceneVM.selectOrgan('stomach');
                    app.dissectionVM.setExplodeFactor(0.0);
                    
                    sv.controls.target.set(0, 0, 0);
                    sv.camera.position.set(0, 0, 5.0);
                    sv.controls.update();

                    // Trigger hover callout on Stomach Layer 1
                    sv.hoverCallout.update({
                        x: 820,
                        y: 510,
                        title: 'Lớp 1: Thanh Mạc (Tunica Serosa)',
                        subtitle: 'Lá tạng của màng bụng (phúc mạc) bao bọc toàn bộ mặt trước và mặt sau dạ dày, trừ dọc theo 2 bờ cong (nơi hai lá của mạc nối lớn và mạc nối nhỏ bám vào) và một vùng trần nhỏ ở mặt sau gần tâm vị tiếp xúc trực tiếp với cơ hoành.',
                        tag: 'MÔ HỌC DẠ DÀY (BAO TỬ) • LỚP 1/4 (NGOÀI CÙNG)',
                        badge: '0.5 - 0.8 mm',
                        color: '#c92a2a'
                    });
                })()'''
            })
            await asyncio.sleep(0.8)

            res2 = await send_cmd('Runtime.evaluate', {
                'returnByValue': True,
                'expression': '''(() => {
                    const card = document.getElementById('hover-callout-card');
                    const line = document.getElementById('hover-leader-line');
                    const pin = document.getElementById('hover-card-pin');
                    const cardRect = card.getBoundingClientRect();
                    const linePoints = line.getAttribute('points');
                    const pinCx = parseFloat(pin.getAttribute('cx'));
                    const pinCy = parseFloat(pin.getAttribute('cy'));
                    return {
                        cardRect: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom, width: cardRect.width, height: cardRect.height },
                        linePoints,
                        pinCoords: { cx: pinCx, cy: pinCy },
                        // Check if pin/line endpoint touches card boundary (within 1.5px tolerance)
                        touchesLeftOrRight: Math.abs(pinCx - cardRect.left) < 2.0 || Math.abs(pinCx - cardRect.right) < 2.0
                    };
                })()'''
            })
            info2 = res2.get('result', {}).get('value', {})
            print("Callout Card Rect:", info2.get('cardRect'))
            print("Leader Line Points:", info2.get('linePoints'))
            print("Pin Coords:", info2.get('pinCoords'))
            print("Touches Card Border Exactly:", info2.get('touchesLeftOrRight'))
            assert info2.get('touchesLeftOrRight'), "Leader line must connect directly to the card border!"
            await take_shot(SHOT_80B)

            # TEST 3: Justified Text in Drawer
            print("\n=== TEST 3: Justified Text in Drawer ===", flush=True)
            res3 = await send_cmd('Runtime.evaluate', {
                'returnByValue': True,
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    app.sceneVM.selectOrgan('stomach');
                    const drawer = document.getElementById('organ-drawer');
                    const pElements = Array.from(drawer.querySelectorAll('.drawer-section p, .wall-sub-block, .wall-clinical-sub'));
                    const alignments = pElements.map(el => window.getComputedStyle(el).textAlign);
                    return {
                        isOpen: drawer.classList.contains('open'),
                        count: pElements.length,
                        allJustified: alignments.every(a => a === 'justify'),
                        alignments: alignments.slice(0, 5)
                    };
                })()'''
            })
            info3 = res3.get('result', {}).get('value', {})
            print("Drawer is Open:", info3.get('isOpen'))
            print("Description element count:", info3.get('count'))
            print("All Justified:", info3.get('allJustified'))
            print("Sample alignments:", info3.get('alignments'))
            assert info3.get('allJustified'), "All descriptive text in drawer must have text-align: justify!"
            await asyncio.sleep(0.5)
            await take_shot(SHOT_80C)

            # TEST 4: "Reset view" Button Interaction
            print("\n=== TEST 4: Reset View Button Execution ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const resetBtn = document.getElementById('btn-reset-camera');
                    resetBtn.click();
                })()'''
            })
            await asyncio.sleep(0.8)

            res4 = await send_cmd('Runtime.evaluate', {
                'returnByValue': True,
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const drawer = document.getElementById('organ-drawer');
                    return {
                        activeOrgan: app.sceneVM.state.activeOrganId,
                        isIsolated: app.dissectionVM.state.isIsolated,
                        drawerOpen: drawer.classList.contains('open')
                    };
                })()'''
            })
            info4 = res4.get('result', {}).get('value', {})
            print("After Reset View Click:")
            print("Active Organ (should be null):", info4.get('activeOrgan'))
            print("Is Isolated (should be false):", info4.get('isIsolated'))
            print("Drawer Open (should be false):", info4.get('drawerOpen'))
            assert info4.get('activeOrgan') is None, "Reset view should clear active organ!"
            assert not info4.get('isIsolated'), "Reset view should return to whole system mode!"
            assert not info4.get('drawerOpen'), "Reset view should close the drawer!"
            await take_shot(SHOT_80D)

            print("\n>>> ALL 4 VERIFICATION TESTS PASSED SUCCESSFULLY! <<<")

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            pass

if __name__ == '__main__':
    asyncio.run(main())
