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
HTTP_PORT = 8199
CDP_PORT = 9440
URL = f'http://127.0.0.1:{HTTP_PORT}/index.html'

ROOT_DIR = r'd:\huong\antigravity\digestion_system_study'
SCREENSHOT_DIR = os.path.join(ROOT_DIR, 'assets', 'screenshots')
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

SHOT_3D = os.path.join(SCREENSHOT_DIR, '54_anatomy_theme_3d.png')
SHOT_HELP = os.path.join(SCREENSHOT_DIR, '55_anatomy_theme_help.png')
SHOT_DRAWER = os.path.join(SCREENSHOT_DIR, '56_anatomy_theme_drawer.png')
SHOT_LANDMARKS = os.path.join(SCREENSHOT_DIR, '57_clinical_landmarks_red_yellow_ring.png')
SHOT_MOB_LAND_INIT = os.path.join(SCREENSHOT_DIR, '58_mobile_landscape_init.png')
SHOT_MOB_LAND_LAYERS = os.path.join(SCREENSHOT_DIR, '59_mobile_landscape_layers.png')
SHOT_MOB_LAND_HEATMAP = os.path.join(SCREENSHOT_DIR, '60_mobile_landscape_heatmap_pin.png')
SHOT_MOB_PORTRAIT = os.path.join(SCREENSHOT_DIR, '61_mobile_portrait_layers.png')
SHOT_MOB_PORTRAIT_CONTROLS = os.path.join(SCREENSHOT_DIR, '62_mobile_portrait_controls.png')
SHOT_MOB_PORTRAIT_HEATMAP = os.path.join(SCREENSHOT_DIR, '63_mobile_portrait_heatmap_pin.png')

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
        '--no-first-run',
        '--no-default-browser-check',
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
        print("Discovered CDP targets:", [(t.get('type'), t.get('url')) for t in tabs], flush=True)
        page_tab = next((t for t in tabs if t.get('type') == 'page'), tabs[0])
        ws_url = page_tab['webSocketDebuggerUrl']
        print(f"Connected to CDP WebSocket: {ws_url}", flush=True)

        async with websockets.connect(ws_url, max_size=25*1024*1024) as ws:
            loop = asyncio.get_running_loop()
            pending = {}
            req_id = 1

            async def send_cmd(method, params=None, timeout=15.0):
                nonlocal req_id
                cid = req_id
                req_id += 1
                fut = loop.create_future()
                pending[cid] = fut
                await ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
                return await asyncio.wait_for(fut, timeout=timeout)

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
                        elif d.get('method') == 'Runtime.exceptionThrown':
                            exc = d.get('params', {}).get('exceptionDetails', {})
                            print("  [Browser Exception]", exc.get('text'), exc.get('exception', {}).get('description', ''), flush=True)
                except Exception:
                    pass

            listen_task = asyncio.create_task(bg_listener())

            await send_cmd("Page.enable")
            await send_cmd("Runtime.enable")

            print(f"Navigating to {URL}...", flush=True)
            await send_cmd("Page.navigate", {"url": URL})

            print("Waiting for app ready...", flush=True)
            for idx in range(40):
                await asyncio.sleep(0.5)
                res = await send_cmd("Runtime.evaluate", {
                    "expression": "JSON.stringify({ready: document.readyState, app: Boolean(window.__DIGESTIVE_APP__), organs: Boolean(window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.organsGroup)})"
                })
                raw_val = res.get("result", {}).get("value")
                if idx % 6 == 0:
                    print(f"  poll {idx}: {raw_val or res}", flush=True)
                if raw_val and '"organs":true' in raw_val:
                    print("App fully loaded and rendered!", flush=True)
                    break

            await asyncio.sleep(2.0)

            async def save_shot(path):
                shot = await send_cmd("Page.captureScreenshot", {"format": "png"})
                data = base64.b64decode(shot["data"])
                with open(path, "wb") as f:
                    f.write(data)
                print(f"[Screenshot] Saved: {path} ({len(data)} bytes)", flush=True)

            # Shot 1: Main 3D view — verify drawer is CLOSED on initial load
            init_drawer = await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    const d = document.getElementById('organ-drawer');
                    const cs = getComputedStyle(d);
                    return JSON.stringify({
                        hasOpen: d.classList.contains('open'),
                        visibility: cs.visibility,
                        rectLeft: Math.round(d.getBoundingClientRect().left),
                        winW: window.innerWidth
                    });
                })()"""
            })
            print("Initial drawer check:", init_drawer.get("result", {}).get("value"), flush=True)
            print("Capturing 54_anatomy_theme_3d.png...", flush=True)
            await save_shot(SHOT_3D)

            # Shot 2: Switch to Help Tab
            print("Clicking 'Trợ giúp' tab...", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": "document.getElementById('nav-btn-help').click()"
            })
            await asyncio.sleep(0.8)
            print("Capturing 55_anatomy_theme_help.png...", flush=True)
            await save_shot(SHOT_HELP)

            # Shot 3: Select stomach -> verify drawer opens, X closes it, empty click closes it
            print("Selecting stomach and testing X + empty-click drawer close...", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": "document.getElementById('nav-btn-3d').click(); window.__DIGESTIVE_APP__.sceneVM.selectOrgan('stomach');"
            })
            await asyncio.sleep(1.5)
            print("Capturing 56_anatomy_theme_drawer.png...", flush=True)
            await save_shot(SHOT_DRAWER)

            close_check = await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    const d = document.getElementById('organ-drawer');
                    const openBefore = d.classList.contains('open');
                    document.getElementById('drawer-close').click();
                    const openAfterX = d.classList.contains('open');
                    window.__DIGESTIVE_APP__.uiView._showOrganDrawer(
                        window.__DIGESTIVE_APP__.appVM.organsData.find(o => o.id === 'stomach')
                    );
                    const openReopened = d.classList.contains('open');
                    document.getElementById('canvas-container').dispatchEvent(new CustomEvent('canvas:empty-click'));
                    const openAfterEmpty = d.classList.contains('open');
                    return JSON.stringify({ openBefore, openAfterX, openReopened, openAfterEmpty });
                })()"""
            })
            print("Drawer X & empty-click close check:", close_check.get("result", {}).get("value"), flush=True)

            # Shot 4: Clinical Landmarks mode — verify mode pills, slider progress, red-dot/yellow-ring, and NO muscle hover labels
            print("Switching to Clinical Landmarks mode...", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": "document.querySelector('.mode-pill[data-mode=\"pathology\"]').click();"
            })
            await asyncio.sleep(2.5)
            # Test slider progress sync and torso muscle hover suppression
            landmarks_check = await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    const slider = document.getElementById('torso-opacity-slider');
                    slider.value = '0.8';
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                    const canvas = window.__DIGESTIVE_APP__.sceneView.renderer.domElement;
                    const r = canvas.getBoundingClientRect();
                    canvas.dispatchEvent(new PointerEvent('pointermove', {
                        pointerType: 'mouse', buttons: 0,
                        clientX: r.left + r.width * 0.5,
                        clientY: r.top + r.height * 0.52,
                        bubbles: true
                    }));
                    const overlay = document.getElementById('hover-callout-overlay');
                    const calloutVisible = overlay && !overlay.classList.contains('hidden');
                    const firstMarker = window.__DIGESTIVE_APP__.sceneView.landmarkMarkers.values().next().value;
                    return JSON.stringify({
                        dissectionClasses: document.querySelector('.mode-pill[data-mode="dissection"]').className,
                        pathologyClasses: document.querySelector('.mode-pill[data-mode="pathology"]').className,
                        sliderProgress: slider.style.getPropertyValue('--progress'),
                        landmarksCount: window.__DIGESTIVE_APP__.sceneView.landmarkMarkers.size,
                        firstMarkerChildren: firstMarker ? firstMarker.children.length : 0,
                        torsoHoverCalloutVisible: calloutVisible,
                        torsoCalloutTitle: calloutVisible ? document.getElementById('hover-callout-title').textContent : null
                    });
                })()"""
            })
            print("Landmarks & Slider & No-Muscle-Hover check:", landmarks_check.get("result", {}).get("value"), flush=True)
            print("Capturing 57_clinical_landmarks_red_yellow_ring.png...", flush=True)
            await save_shot(SHOT_LANDMARKS)

            # Shot 5: Mobile Landscape (852x393) Initial State
            print("Testing Mobile Landscape (852x393)...", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": "document.querySelector('.mode-pill[data-mode=\"dissection\"]').click(); window.__DIGESTIVE_APP__.sceneVM.selectOrgan(null); window.__DIGESTIVE_APP__.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0, organDisplayMode: 'layers' });"
            })
            await send_cmd("Emulation.setDeviceMetricsOverride", {
                "width": 852, "height": 393, "deviceScaleFactor": 2, "mobile": True
            })
            await send_cmd("Runtime.evaluate", {"expression": "window.dispatchEvent(new Event('resize'));"})
            await asyncio.sleep(1.2)
            await save_shot(SHOT_MOB_LAND_INIT)

            # Shot 6: Mobile Landscape — Stomach Isolated Layers Mode (Single Focused Layer Card)
            await send_cmd("Runtime.evaluate", {
                "expression": "window.__DIGESTIVE_APP__.sceneVM.selectOrgan('stomach'); window.__DIGESTIVE_APP__.dissectionVM.setState({ isIsolateMode: true, organDisplayMode: 'layers' });"
            })
            await asyncio.sleep(1.5)
            mob_layers_info = await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    const visibleCards = [...document.querySelectorAll('.wall-layer-card')].filter(c => getComputedStyle(c).display !== 'none').length;
                    const pills = document.querySelectorAll('.mobile-layer-pill').length;
                    const dockW = document.getElementById('dissection-dock').getBoundingClientRect().width;
                    const drawerW = document.getElementById('organ-drawer').getBoundingClientRect().width;
                    return JSON.stringify({ visibleCards, pills, dockW: Math.round(dockW), drawerW: Math.round(drawerW) });
                })()"""
            })
            print("Mobile landscape layers check:", mob_layers_info.get("result", {}).get("value"), flush=True)
            await save_shot(SHOT_MOB_LAND_LAYERS)

            # Shot 7: Mobile Landscape — Switch to Heatmap (Phân Vùng) Mode + Tap/Pin Region
            await send_cmd("Runtime.evaluate", {
                "expression": "window.__DIGESTIVE_APP__.dissectionVM.setOrganDisplayMode('regions');"
            })
            await asyncio.sleep(0.8)
            await send_cmd("Runtime.evaluate", {
                "expression": "window.__DIGESTIVE_APP__.sceneView.pinHeatmapRegion('stomach', 'antrum');"
            })
            await asyncio.sleep(0.8)
            mob_heatmap_info = await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    const regionCards = document.querySelectorAll('.heatmap-region-card').length;
                    const visibleRegionCards = [...document.querySelectorAll('.heatmap-region-card')].filter(c => getComputedStyle(c).display !== 'none').length;
                    const overlayHidden = document.getElementById('hover-callout-overlay').classList.contains('hidden');
                    const calloutTitle = document.getElementById('hover-callout-title').textContent;
                    const dotCx = document.getElementById('hover-anchor-dot').getAttribute('cx');
                    return JSON.stringify({ regionCards, visibleRegionCards, overlayHidden, calloutTitle, dotCx });
                })()"""
            })
            print("Mobile heatmap pin & drawer check:", mob_heatmap_info.get("result", {}).get("value"), flush=True)
            await save_shot(SHOT_MOB_LAND_HEATMAP)

            # Shot 8: Mobile Portrait (390x844) — Red Tap Dot + 1/3 Single-Layer Bottom Popup
            print("Testing Mobile Portrait Template (390x844)...", flush=True)
            await send_cmd("Emulation.setDeviceMetricsOverride", {
                "width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True
            })
            await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    window.__DIGESTIVE_APP__.dissectionVM.setOrganDisplayMode('layers');
                    window.dispatchEvent(new Event('resize'));
                    window.__DIGESTIVE_APP__.sceneVM.selectOrgan('stomach');
                    window.__DIGESTIVE_APP__.dissectionVM.setExplodeFactor(0.8);
                })()"""
            })
            await asyncio.sleep(1.5)
            # Helper to dispatch genuine CDP mouse click at exact projected stomach surface point
            async def cdp_tap_organ_center(offset_x=0, offset_y=0):
                pt_res = await send_cmd("Runtime.evaluate", {
                    "expression": """(() => {
                        const sv = window.__DIGESTIVE_APP__.sceneView;
                        const target = sv.controls.target;
                        const p = sv._projectWorldToScreen(target);
                        const r = sv.container.getBoundingClientRect();
                        return JSON.stringify({ x: r.left + p.x, y: r.top + p.y });
                    })()"""
                })
                pt = json.loads(pt_res["result"]["value"])
                tx = pt["x"] + offset_x
                ty = pt["y"] + offset_y
                await send_cmd("Input.dispatchMouseEvent", {
                    "type": "mousePressed", "x": tx, "y": ty, "button": "left", "clickCount": 1
                })
                await send_cmd("Input.dispatchMouseEvent", {
                    "type": "mouseReleased", "x": tx, "y": ty, "button": "left", "clickCount": 1
                })

            # Tap right on the Stomach Corpus/Antrum body (slightly down-right of target notch)
            await cdp_tap_organ_center(25, 25)
            await asyncio.sleep(0.8)
            portrait_info = await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    const c = document.getElementById('canvas-container').getBoundingClientRect();
                    const d = document.getElementById('organ-drawer').getBoundingClientRect();
                    const layerCards = document.querySelectorAll('#organ-drawer .wall-layer-card').length;
                    const pills = document.querySelectorAll('#organ-drawer .mobile-layer-pill').length;
                    const calloutCardDisp = getComputedStyle(document.getElementById('hover-callout-card')).display;
                    const dotHidden = document.getElementById('hover-callout-overlay').classList.contains('hidden');
                    return JSON.stringify({
                        layoutClass: document.body.className,
                        portraitView: document.body.dataset.portraitView,
                        portraitPopup: document.body.dataset.portraitPopup,
                        canvasH: Math.round(c.height),
                        drawerH: Math.round(d.height),
                        layerCards,
                        pills,
                        calloutCardDisp,
                        dotHidden
                    });
                })()"""
            })
            print("Mobile portrait single-layer popup check:", portrait_info.get("result", {}).get("value"), flush=True)
            await save_shot(SHOT_MOB_PORTRAIT)

            # Shot 9: Mobile Portrait — Tap Circular Double-Chevron Button -> Fullscreen Control Panel + verify selecting organ keeps panel open
            await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    document.getElementById('portrait-panel-toggle').click();
                    document.querySelector('.body-pin[data-organ="liver"]').click();
                })()"""
            })
            await asyncio.sleep(0.8)
            panel_full_info = await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    const dock = document.getElementById('dissection-dock').getBoundingClientRect();
                    const toggleBg = getComputedStyle(document.getElementById('portrait-panel-toggle')).backgroundColor;
                    const viewAfterSelect = document.body.dataset.portraitView;
                    document.querySelector('.body-pin[data-organ="stomach"]').click();
                    return JSON.stringify({
                        portraitView: viewAfterSelect,
                        dockW: Math.round(dock.width),
                        dockH: Math.round(dock.height),
                        toggleBg
                    });
                })()"""
            })
            print("Mobile portrait fullscreen panel check:", panel_full_info.get("result", {}).get("value"), flush=True)
            await save_shot(SHOT_MOB_PORTRAIT_CONTROLS)

            # Shot 10: Mobile Portrait — Collapse Panel via Double-Chevron Down -> Switch Heatmap -> Tap 3D for Red Dot + 1/3 Region Popup
            await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    document.getElementById('portrait-panel-toggle').click();
                    window.__DIGESTIVE_APP__.dissectionVM.setExplodeFactor(0.0);
                    window.__DIGESTIVE_APP__.dissectionVM.setOrganDisplayMode('regions');
                })()"""
            })
            await asyncio.sleep(0.9)
            # Tap right on the Stomach Corpus/Antrum body (slightly down-right of target notch)
            await cdp_tap_organ_center(25, 25)
            await asyncio.sleep(0.8)
            portrait_heatmap_info = await send_cmd("Runtime.evaluate", {
                "expression": """(() => {
                    const regionCards = document.querySelectorAll('#organ-drawer .heatmap-region-card').length;
                    const overlayHidden = document.getElementById('hover-callout-overlay').classList.contains('hidden');
                    return JSON.stringify({
                        portraitView: document.body.dataset.portraitView,
                        portraitPopup: document.body.dataset.portraitPopup,
                        regionCards,
                        overlayHidden
                    });
                })()"""
            })
            print("Mobile portrait heatmap red dot + 1/3 popup check:", portrait_heatmap_info.get("result", {}).get("value"), flush=True)
            await save_shot(SHOT_MOB_PORTRAIT_HEATMAP)

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
