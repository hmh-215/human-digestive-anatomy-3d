import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import websockets

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9318
URL = "http://localhost:8086/index.html?v=20261115_v33"
OUT_DIR = r"C:\Users\proto\.gemini\antigravity\brain\032716ed-4938-4dcf-a8c3-035bc613e5a6\scratch"

SHOT_1 = os.path.join(OUT_DIR, "v30_1_anterior_viscera_overview.png")
SHOT_2 = os.path.join(OUT_DIR, "v30_2_liver_stomach_vessels_closeup.png")
SHOT_3 = os.path.join(OUT_DIR, "v30_3_clinical_torso_landmarks.png")
SHOT_4 = os.path.join(OUT_DIR, "v30_4_liver_isolated_ligaments.png")


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    temp_dir = tempfile.mkdtemp()
    proc = subprocess.Popen(
        [
            EDGE_PATH,
            "--headless=new",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={temp_dir}",
            "--window-size=1500,1000",
            "about:blank",
        ]
    )
    console_errors = []
    try:
        tabs = None
        for _ in range(25):
            try:
                await asyncio.sleep(0.35)
                raw = urllib.request.urlopen(f"http://localhost:{PORT}/json").read().decode()
                tabs = json.loads(raw)
                if tabs:
                    break
            except Exception:
                pass
        if not tabs:
            raise RuntimeError("Failed to connect to Edge CDP")

        ws_url = next(t for t in tabs if t.get("type") == "page")["webSocketDebuggerUrl"]
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
                await ws.send(json.dumps({"id": cid, "method": method, "params": params or {}}))
                return await fut

            async def bg_listener():
                try:
                    async for msg in ws:
                        d = json.loads(msg)
                        if "id" in d and d["id"] in pending:
                            f = pending.pop(d["id"])
                            if "error" in d:
                                f.set_exception(Exception(d["error"]))
                            else:
                                f.set_result(d.get("result", {}))
                        elif d.get("method") == "Runtime.consoleAPICalled":
                            p = d.get("params", {})
                            if p.get("type") == "error":
                                txt = " ".join(str(a.get("value", a.get("description", ""))) for a in p.get("args", []))
                                console_errors.append(txt)
                        elif d.get("method") == "Runtime.exceptionThrown":
                            ex = d.get("params", {}).get("exceptionDetails", {})
                            console_errors.append(str(ex.get("text", ex)))
                except Exception:
                    pass

            listen_task = asyncio.create_task(bg_listener())
            await send_cmd("Page.enable")
            await send_cmd("Runtime.enable")

            print(f"Navigating to {URL}...", flush=True)
            await send_cmd("Page.navigate", {"url": URL})

            for i in range(60):
                await asyncio.sleep(0.5)
                res = await send_cmd(
                    "Runtime.evaluate",
                    {
                        "expression": "JSON.stringify({ cm: window.__DIGESTIVE_APP__?.sceneView?.clickableMeshes?.length || 0, tl: Boolean(window.__DIGESTIVE_APP__?.sceneView?.torsoLoaded), tg: Boolean(window.__DIGESTIVE_APP__?.sceneView?.torsoLoading) })"
                    },
                )
                st = json.loads(res.get("result", {}).get("value", "{}"))
                if i % 10 == 0:
                    print(f"  poll {i}: {st} errors={console_errors}", flush=True)
                if st.get("cm", 0) > 10 and st.get("tl"):
                    print(f"Scene & Torso ready at attempt {i+1}", flush=True)
                    break
                if st.get("cm", 0) > 10 and not st.get("tg") and i >= 6:
                    await send_cmd("Runtime.evaluate", {"expression": "window.__DIGESTIVE_APP__?.sceneView?._ensureTorsoLoaded()"})
            else:
                print("FINAL CONSOLE ERRORS:", console_errors, flush=True)
                raise RuntimeError("Timeout waiting for 3D scene & torsoLoaded")

            await asyncio.sleep(1.0)

            async def snap(path):
                shot = await send_cmd("Page.captureScreenshot", {"format": "png"})
                with open(path, "wb") as f:
                    f.write(base64.b64decode(shot["data"]))
                print(f"Captured {path}", flush=True)

            # Check torso mesh count + round ligament & omentum bounds in scene coords
            stats = await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const sv = window.__DIGESTIVE_APP__.sceneView;
                        const torsoCount = sv.torsoMuscleMeshes ? sv.torsoMuscleMeshes.length : -1;
                        const torsoNames = (sv.torsoMuscleMeshes || []).map(m => m.name);
                        const box = new THREE.Box3();
                        if (sv.torsoRoot) box.setFromObject(sv.torsoRoot);
                        return JSON.stringify({
                            torsoMeshCount: torsoCount,
                            torsoNames,
                            torsoBoxMin: [box.min.x, box.min.y, box.min.z],
                            torsoBoxMax: [box.max.x, box.max.y, box.max.z],
                            clickableCount: sv.clickableMeshes.length
                        });
                    })()"""
                },
            )
            print("SCENE STATS:", stats.get("result", {}).get("value"), flush=True)

            # Shot 1: Anterior Viscera Overview (like Image 1)
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const app = window.__DIGESTIVE_APP__;
                        const sv = app.sceneView;
                        app.appVM.setMode('anatomy');
                        app.dissectionVM.setIsolateMode(false);
                        app.sceneVM.selectOrgan(null);
                        sv.controls.target.set(0.0, 0.2, 0.0);
                        sv.camera.position.set(0.0, 0.4, 9.8);
                        sv.controls.update();
                    })()"""
                },
            )
            await asyncio.sleep(0.8)
            await snap(SHOT_1)

            # Shot 2: Closeup of Liver + Stomach + Upper Mesenteric/Splenic Vessels
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const app = window.__DIGESTIVE_APP__;
                        const sv = app.sceneView;
                        sv.controls.target.set(0.0, 0.15, 0.25);
                        sv.camera.position.set(0.15, 0.25, 5.2);
                        sv.controls.update();
                    })()"""
                },
            )
            await asyncio.sleep(0.8)
            await snap(SHOT_2)

            # Shot 2b: Same closeup with Greater_omentum hidden so stomach/intestinal vessels are 100% visible
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const sv = window.__DIGESTIVE_APP__.sceneView;
                        sv.masterRoot.traverse(c => {
                            if (c.isMesh && /greater_omentum/i.test(c.name)) c.visible = false;
                        });
                        sv.controls.target.set(0.0, -0.35, 0.1);
                        sv.camera.position.set(0.15, -0.25, 5.6);
                        sv.controls.update();
                    })()"""
                },
            )
            await asyncio.sleep(0.6)
            await snap(os.path.join(OUT_DIR, "v30_5_vessels_no_omentum.png"))
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const sv = window.__DIGESTIVE_APP__.sceneView;
                        sv.masterRoot.traverse(c => {
                            if (c.isMesh && /greater_omentum/i.test(c.name)) c.visible = true;
                        });
                    })()"""
                },
            )

            # Shot 3: Clinical Landmarks + Unified Torso Skin View (like Image 2)
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const app = window.__DIGESTIVE_APP__;
                        const sv = app.sceneView;
                        app.appVM.setMode('pathology');
                        sv.controls.target.set(0.0, 0.85, 0.0);
                        sv.camera.position.set(0.0, 0.95, 10.6);
                        sv.controls.update();
                    })()"""
                },
            )
            await asyncio.sleep(0.9)
            await snap(SHOT_3)

            # Shot 3b: Sculpted Torso at 85% opacity to verify muscle details (abs, obliques, pecs) & seam-free patching
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const app = window.__DIGESTIVE_APP__;
                        app.dissectionVM.setTorsoSkinOpacity(0.85);
                    })()"""
                },
            )
            await asyncio.sleep(0.5)
            await snap(os.path.join(OUT_DIR, "v30_7_torso_85pct_sculpted.png"))
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": "window.__DIGESTIVE_APP__.dissectionVM.setTorsoSkinOpacity(0.50);"
                },
            )

            # Shot 4: Isolated Liver Anterior-Superior view to inspect all ligaments
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const app = window.__DIGESTIVE_APP__;
                        const sv = app.sceneView;
                        app.appVM.setMode('anatomy');
                        app.dissectionVM.setIsolateMode(true);
                        app.sceneVM.selectOrgan('liver');
                        app.dissectionVM.setExplodeFactor(0.0);
                        sv.controls.target.set(-0.35, 0.45, 0.0);
                        sv.camera.position.set(-0.25, 1.85, 5.6);
                        sv.controls.update();
                    })()"""
                },
            )
            await asyncio.sleep(0.8)
            await snap(SHOT_4)

            # Shot 6: Posterior view of isolated liver ligaments & bare area
            await send_cmd(
                "Runtime.evaluate",
                {
                    "expression": """(() => {
                        const sv = window.__DIGESTIVE_APP__.sceneView;
                        sv.controls.target.set(-0.35, 0.40, 0.0);
                        sv.camera.position.set(-0.35, 0.55, -5.6);
                        sv.controls.update();
                    })()"""
                },
            )
            await asyncio.sleep(0.7)
            await snap(os.path.join(OUT_DIR, "v30_6_liver_posterior_ligaments.png"))

            print("CONSOLE ERRORS:", len(console_errors), console_errors, flush=True)
            listen_task.cancel()
    finally:
        proc.terminate()
        proc.wait()


if __name__ == "__main__":
    asyncio.run(main())
