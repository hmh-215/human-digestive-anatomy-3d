import asyncio
import json
import urllib.request
import websockets
import subprocess
import base64
import os
import tempfile

EDGE_PATH = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9310
URL = 'http://localhost:8085/index.html?v=20261108_v24'
ARTIFACT_DIR = r'C:\Users\proto\.gemini\antigravity\brain\fbb7c5cc-535a-4012-8e55-dcd4716ee74a'

SHOT_77A = os.path.join(ARTIFACT_DIR, '77a_gallbladder_and_bileduct_isolated_unexploded.png')
SHOT_77B = os.path.join(ARTIFACT_DIR, '77b_gallbladder_and_bileduct_4_attached_layers_exploded.png')
SHOT_77C = os.path.join(ARTIFACT_DIR, '77c_gallbladder_and_bileduct_discrete_heatmap.png')
SHOT_77D = os.path.join(ARTIFACT_DIR, '77d_pancreas_isolated_view.png')

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

            # Wait for 3D model loading
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

            await asyncio.sleep(1.0)

            async def take_shot(filepath):
                shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
                with open(filepath, 'wb') as f:
                    f.write(base64.b64decode(shot['data']))
                print(f"Saved screenshot: {filepath}", flush=True)

            # TEST 1: Select Gallbladder Tree in Isolated Mode (explode = 0)
            print("\n=== TEST 1: Gallbladder + Bile Duct Isolated Unexploded (0%) ===", flush=True)
            test1_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.dissectionVM.setIsolateMode(true);
                    app.sceneVM.selectOrgan('gallbladder_tree');
                    app.dissectionVM.setExplodeFactor(0.0);
                    
                    const gbMeshes = sv.gallbladderWallMeshes || [];
                    const bdMeshes = sv.bileDuctWallMeshes || [];
                    
                    const gbVisible = gbMeshes.filter(m => m.visible).map(m => m.name);
                    const bdVisible = bdMeshes.filter(m => m.visible).map(m => m.name);
                    
                    return {
                        selected: app.sceneVM.state.selectedOrganId,
                        isIsolate: app.dissectionVM.state.isIsolateMode,
                        gbVisible,
                        bdVisible,
                        gbTotal: gbMeshes.length,
                        bdTotal: bdMeshes.length
                    };
                })()''',
                'returnByValue': True
            })
            t1 = test1_res.get('result', {}).get('value')
            print("Test 1 Result:", json.dumps(t1, indent=2), flush=True)
            assert t1['selected'] == 'gallbladder_tree', "Must be gallbladder_tree"
            assert t1['isIsolate'] is True, "Must be isolate mode"
            assert 'gb_serosa_fibrous' in t1['gbVisible'], "gb_serosa_fibrous must be visible at explode 0"
            assert 'bile_adventitia' in t1['bdVisible'], "bile_adventitia must be visible at explode 0"
            assert len(t1['gbVisible']) == 1, "Only layer 0 of GB should be visible unexploded"
            assert len(t1['bdVisible']) == 1, "Only layer 0 of BD should be visible unexploded"

            await asyncio.sleep(0.5)
            await take_shot(SHOT_77A)

            # TEST 2: Explode to 85% - Check that all 4 layers of GB + BD are visible and attached
            print("\n=== TEST 2: Gallbladder + Bile Duct 4 Attached Layers Exploded (85%) ===", flush=True)
            test2_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    app.dissectionVM.setExplodeFactor(0.85);
                    
                    const gbMeshes = sv.gallbladderWallMeshes || [];
                    const bdMeshes = sv.bileDuctWallMeshes || [];
                    
                    const gbData = gbMeshes.map(m => ({
                        name: m.name,
                        idx: m.userData.wallLayerIndex,
                        visible: m.visible,
                        pos: { x: +m.position.x.toFixed(2), y: +m.position.y.toFixed(2), z: +m.position.z.toFixed(2) }
                    }));
                    const bdData = bdMeshes.map(m => ({
                        name: m.name,
                        idx: m.userData.wallLayerIndex,
                        visible: m.visible,
                        pos: { x: +m.position.x.toFixed(2), y: +m.position.y.toFixed(2), z: +m.position.z.toFixed(2) }
                    }));
                    
                    // Check relative offset between gb layer i and bd layer i
                    const offsets = [];
                    for (let i = 0; i < 4; i++) {
                        const gbPos = gbMeshes[i].position;
                        const bdPos = bdMeshes[i].position;
                        const gbInit = gbMeshes[i].userData.initialPos;
                        const bdInit = bdMeshes[i].userData.initialPos;
                        const gbDisp = { x: +(gbPos.x - gbInit.x).toFixed(2), y: +(gbPos.y - gbInit.y).toFixed(2), z: +(gbPos.z - gbInit.z).toFixed(2) };
                        const bdDisp = { x: +(bdPos.x - bdInit.x).toFixed(2), y: +(bdPos.y - bdInit.y).toFixed(2), z: +(bdPos.z - bdInit.z).toFixed(2) };
                        offsets.push({
                            layer: i,
                            gbDisp,
                            bdDisp,
                            delta: { x: +(gbDisp.x - bdDisp.x).toFixed(2), y: +(gbDisp.y - bdDisp.y).toFixed(2), z: +(gbDisp.z - bdDisp.z).toFixed(2) }
                        });
                    }
                    
                    return {
                        gbCount: gbMeshes.filter(m => m.visible).length,
                        bdCount: bdMeshes.filter(m => m.visible).length,
                        gbData,
                        bdData,
                        offsets,
                        camera: {
                            pos: { x: +sv.camera.position.x.toFixed(2), y: +sv.camera.position.y.toFixed(2), z: +sv.camera.position.z.toFixed(2) },
                            target: { x: +sv.controls.target.x.toFixed(2), y: +sv.controls.target.y.toFixed(2), z: +sv.controls.target.z.toFixed(2) }
                        }
                    };
                })()''',
                'returnByValue': True
            })
            t2 = test2_res.get('result', {}).get('value')
            print("Test 2 Result:", json.dumps(t2, indent=2), flush=True)
            assert t2['gbCount'] == 4, f"All 4 GB layers must be visible, got {t2['gbCount']}"
            assert t2['bdCount'] == 4, f"All 4 BD layers must be visible, got {t2['bdCount']}"
            
            for o in t2['offsets']:
                assert o['delta']['x'] == 0.0 and o['delta']['y'] == 0.0 and o['delta']['z'] == 0.0, f"Layer {o['layer']} displacement mismatch: GB {o['gbDisp']} vs BD {o['bdDisp']}"
            print("All 4 Bile Duct layers have EXACT MATCHING translation displacement with Gallbladder layers! (100% attached)", flush=True)

            await asyncio.sleep(0.5)
            await take_shot(SHOT_77B)

            # TEST 3: Discrete Step Heatmap on Gallbladder & Bile Duct
            print("\n=== TEST 3: Discrete Step Heatmap ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': 'window.__DIGESTIVE_APP__.dissectionVM.setExplodeFactor(0.0); window.__DIGESTIVE_APP__.dissectionVM.setOrganDisplayMode("regions");'
            })
            await asyncio.sleep(0.5)
            test3_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    const gb0 = sv.gallbladderWallMeshes[0];
                    const bd0 = sv.bileDuctWallMeshes[0];
                    return {
                        mode: app.dissectionVM.state.organDisplayMode,
                        gb0Visible: gb0.visible,
                        bd0Visible: bd0.visible,
                        gb0HasColor: Boolean(gb0.geometry.attributes.color),
                        bd0HasColor: Boolean(bd0.geometry.attributes.color)
                    };
                })()''',
                'returnByValue': True
            })
            t3 = test3_res.get('result', {}).get('value')
            print("Test 3 Result:", json.dumps(t3, indent=2), flush=True)
            assert t3['mode'] == 'regions', "Must be regions mode"
            assert t3['gb0Visible'] is True, "Gallbladder layer 0 must be visible in heatmap mode"
            assert t3['bd0Visible'] is True, "Bile duct layer 0 must be visible in heatmap mode"
            assert t3['gb0HasColor'] is True, "Gallbladder must have vertex colors"
            assert t3['bd0HasColor'] is True, "Bile duct must have vertex colors"

            await asyncio.sleep(0.5)
            await take_shot(SHOT_77C)

            # TEST 4: Pancreas Isolated View
            print("\n=== TEST 4: Pancreas Isolated View ===", flush=True)
            await send_cmd('Runtime.evaluate', {
                'expression': 'window.__DIGESTIVE_APP__.dissectionVM.setOrganDisplayMode("layers"); window.__DIGESTIVE_APP__.sceneVM.selectOrgan("pancreas");'
            })
            await asyncio.sleep(0.5)
            test4_res = await send_cmd('Runtime.evaluate', {
                'expression': '''(() => {
                    const app = window.__DIGESTIVE_APP__;
                    const sv = app.sceneView;
                    const visible = sv.clickableMeshes.filter(m => m.visible).map(m => m.name);
                    return {
                        selected: app.sceneVM.state.selectedOrganId,
                        visible
                    };
                })()''',
                'returnByValue': True
            })
            t4 = test4_res.get('result', {}).get('value')
            print("Test 4 Result:", json.dumps(t4, indent=2), flush=True)
            assert t4['selected'] == 'pancreas', "Must be pancreas"
            assert 'Pancreas' in t4['visible'], "Pancreas must be visible"
            assert 'Pancreatic_duct' in t4['visible'], "Pancreatic_duct must be visible"

            await asyncio.sleep(0.5)
            await take_shot(SHOT_77D)

            print("\nALL 4 TESTS PASSED FLAWLESSLY!", flush=True)

    finally:
        proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
