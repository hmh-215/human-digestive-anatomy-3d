"""
scripts/build_optimized_glb.py
Offline Asset Pipeline: Extracts only authentic digestive system meshes from VisceralSystem.fbx,
welds duplicate triangle-soup vertices into compact indexed BufferGeometry, preserves UVs on Stomach,
bakes FBX node transforms into clean Z-Anatomy centimeter space, and outputs:
assets/models/DigestiveSystem.glb
"""
import subprocess
import time
import urllib.request
import json
import socket
import base64
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

WORKSPACE = r'd:\huong\antigravity\digestion_system_study'
OUTPUT_GLB = os.path.join(WORKSPACE, 'assets', 'models', 'DigestiveSystem.glb')

def build_digestive_glb():
    print("[1/4] Launching headless Edge to parse VisceralSystem.fbx...")
    proc = subprocess.Popen([
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--headless',
        '--window-size=1200,800',
        '--remote-debugging-port=9225',
        'http://localhost:8085/'
    ])
    time.sleep(3)

    try:
        with urllib.request.urlopen('http://localhost:9225/json') as resp:
            tabs = json.load(resp)
        target_tab = [t for t in tabs if '8085' in t.get('url', '')][0]
        ws_url = target_tab['webSocketDebuggerUrl']
        host = 'localhost'
        port = 9225
        path = ws_url.split(f'{host}:{port}')[1]

        s = socket.socket()
        s.connect((host, port))
        sec_key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {sec_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        s.sendall(req.encode())
        s.recv(4096)

        def send_ws(msg_dict):
            msg = json.dumps(msg_dict).encode()
            frame = bytearray([0x81])
            length = len(msg)
            if length <= 125:
                frame.append(0x80 | length)
            elif length <= 65535:
                frame.append(0x80 | 126)
                frame.extend(length.to_bytes(2, 'big'))
            else:
                frame.append(0x80 | 127)
                frame.extend(length.to_bytes(8, 'big'))
            mask = os.urandom(4)
            frame.extend(mask)
            frame.extend(bytearray([b ^ mask[i % 4] for i, b in enumerate(msg)]))
            s.sendall(frame)

        def recv_ws_json():
            while True:
                hdr = b''
                while len(hdr) < 2:
                    chunk = s.recv(2 - len(hdr))
                    if not chunk:
                        raise RuntimeError("Socket closed")
                    hdr += chunk
                opcode = hdr[0] & 0x0F
                payload_len = hdr[1] & 0x7F
                if payload_len == 126:
                    ext = b''
                    while len(ext) < 2:
                        ext += s.recv(2 - len(ext))
                    payload_len = int.from_bytes(ext, 'big')
                elif payload_len == 127:
                    ext = b''
                    while len(ext) < 8:
                        ext += s.recv(8 - len(ext))
                    payload_len = int.from_bytes(ext, 'big')
                data = bytearray()
                while len(data) < payload_len:
                    chunk = s.recv(min(65536, payload_len - len(data)))
                    if not chunk:
                        break
                    data.extend(chunk)
                if opcode == 1:
                    return json.loads(data.decode('utf-8'))

        print("[2/4] Waiting for VisceralSystem.fbx to finish loading...")
        for _ in range(40):
            send_ws({
                'id': 1,
                'method': 'Runtime.evaluate',
                'params': {
                    'expression': 'Boolean(window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.clickableMeshes && window.__DIGESTIVE_APP__.sceneView.clickableMeshes.length > 0)',
                    'returnByValue': True
                }
            })
            res = recv_ws_json()
            if res.get('result', {}).get('result', {}).get('value') is True:
                break
            time.sleep(0.5)

        print("[3/4] Welding duplicate vertices & building indexed GLB...")
        js_extract = """
        (() => {
            const sv = window.__DIGESTIVE_APP__.sceneView;
            const masterRoot = sv.masterRoot;
            const Vector3 = sv.camera.position.constructor;
            const Quaternion = sv.camera.quaternion.constructor;

            const savedScale = masterRoot.scale.clone();
            const savedPos = masterRoot.position.clone();
            masterRoot.scale.set(1, 1, 1);
            masterRoot.position.set(0, 0, 0);
            masterRoot.updateMatrixWorld(true);

            const targetMeshes = [];
            sv.clickableMeshes.forEach(m => {
                if (m.userData.isStomachWallLayer) {
                    if (m.userData.wallLayerId === 'stomach_serosa') {
                        targetMeshes.push({ mesh: m, name: 'Stomach', organId: 'stomach', keepUV: true });
                    }
                } else {
                    targetMeshes.push({ mesh: m, name: m.name, organId: m.userData.organId, keepUV: false });
                }
            });

            const bufferViews = [];
            const accessors = [];
            const meshes = [];
            const nodes = [];
            const binChunks = [];
            let totalByteLength = 0;
            let rawVertTotal = 0;
            let weldedVertTotal = 0;

            const align4 = (len) => (4 - (len % 4)) % 4;

            const addBufferData = (typedArray, target) => {
                const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
                const pad = align4(bytes.byteLength);
                const byteOffset = totalByteLength;
                binChunks.push(bytes);
                if (pad > 0) {
                    binChunks.push(new Uint8Array(pad));
                }
                totalByteLength += bytes.byteLength + pad;
                const bvIdx = bufferViews.length;
                bufferViews.push({
                    buffer: 0,
                    byteOffset: byteOffset,
                    byteLength: bytes.byteLength,
                    target: target
                });
                return bvIdx;
            };

            const v = new Vector3();
            const n = new Vector3();
            const worldQuat = new Quaternion();

            targetMeshes.forEach((item) => {
                const mesh = item.mesh;
                mesh.updateWorldMatrix(true, false);
                const matWorld = mesh.matrixWorld;
                mesh.getWorldQuaternion(worldQuat);

                const geo = mesh.geometry;
                const posAttr = geo.attributes.position;
                const normAttr = geo.attributes.normal;
                const uvAttr = item.keepUV ? geo.attributes.uv : null;
                const inCount = posAttr.count;
                rawVertTotal += inCount;

                // Spatial hash vertex welding (deduplicate triangle soup into indexed mesh)
                const vertMap = new Map();
                const uniquePos = [];
                const uniqueNorm = [];
                const uniqueUV = [];
                const indices = new Uint32Array(inCount);
                let uniqueCount = 0;

                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

                for (let i = 0; i < inCount; i++) {
                    v.fromBufferAttribute(posAttr, i).applyMatrix4(matWorld);
                    const vx = v.x, vy = v.y, vz = v.z;

                    let nx = 0, ny = 0, nz = 1;
                    if (normAttr) {
                        n.fromBufferAttribute(normAttr, i).applyQuaternion(worldQuat).normalize();
                        nx = n.x; ny = n.y; nz = n.z;
                    }

                    let ux = 0, uy = 0;
                    if (uvAttr) {
                        ux = uvAttr.getX(i);
                        uy = uvAttr.getY(i);
                    }

                    // Hash key: position quantized to 0.05mm + normal quantized to 0.02 + UV if stomach
                    const kx = Math.round(vx * 2000);
                    const ky = Math.round(vy * 2000);
                    const kz = Math.round(vz * 2000);
                    const knx = Math.round(nx * 50);
                    const kny = Math.round(ny * 50);
                    const key = uvAttr
                        ? `${kx}_${ky}_${kz}_${knx}_${kny}_${Math.round(ux * 500)}_${Math.round(uy * 500)}`
                        : `${kx}_${ky}_${kz}_${knx}_${kny}`;

                    let idx = vertMap.get(key);
                    if (idx === undefined) {
                        idx = uniqueCount++;
                        vertMap.set(key, idx);
                        uniquePos.push(vx, vy, vz);
                        uniqueNorm.push(nx, ny, nz);
                        if (uvAttr) uniqueUV.push(ux, uy);

                        if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
                        if (vy < minY) minY = vy; if (vy > maxY) maxY = vy;
                        if (vz < minZ) minZ = vz; if (vz > maxZ) maxZ = vz;
                    }
                    indices[i] = idx;
                }

                weldedVertTotal += uniqueCount;

                const posArray = new Float32Array(uniquePos);
                const normArray = new Float32Array(uniqueNorm);

                const posBv = addBufferData(posArray, 34962);
                const posAcc = accessors.length;
                accessors.push({
                    bufferView: posBv,
                    componentType: 5126,
                    count: uniqueCount,
                    type: 'VEC3',
                    min: [minX, minY, minZ],
                    max: [maxX, maxY, maxZ]
                });

                const normBv = addBufferData(normArray, 34962);
                const normAcc = accessors.length;
                accessors.push({
                    bufferView: normBv,
                    componentType: 5126,
                    count: uniqueCount,
                    type: 'VEC3'
                });

                const attributes = {
                    POSITION: posAcc,
                    NORMAL: normAcc
                };

                if (uvAttr) {
                    const uvArray = new Float32Array(uniqueUV);
                    const uvBv = addBufferData(uvArray, 34962);
                    const uvAcc = accessors.length;
                    accessors.push({
                        bufferView: uvBv,
                        componentType: 5126,
                        count: uniqueCount,
                        type: 'VEC2'
                    });
                    attributes.TEXCOORD_0 = uvAcc;
                }

                const useU32 = uniqueCount > 65535;
                const idxTyped = useU32 ? indices : new Uint16Array(indices);
                const idxBv = addBufferData(idxTyped, 34963);
                const idxAcc = accessors.length;
                accessors.push({
                    bufferView: idxBv,
                    componentType: useU32 ? 5125 : 5123,
                    count: inCount,
                    type: 'SCALAR'
                });

                const meshIdx = meshes.length;
                meshes.push({
                    name: item.name,
                    primitives: [{
                        attributes: attributes,
                        indices: idxAcc
                    }]
                });

                nodes.push({
                    name: item.name,
                    mesh: meshIdx,
                    extras: { organId: item.organId }
                });
            });

            masterRoot.scale.copy(savedScale);
            masterRoot.position.copy(savedPos);
            masterRoot.updateMatrixWorld(true);

            const gltfJson = {
                asset: { version: '2.0', generator: 'Digestive3D Welded GLB Exporter' },
                scenes: [{ name: 'DigestiveSystem', nodes: nodes.map((_, idx) => idx) }],
                scene: 0,
                nodes: nodes,
                meshes: meshes,
                accessors: accessors,
                bufferViews: bufferViews,
                buffers: [{ byteLength: totalByteLength }]
            };

            const jsonStr = JSON.stringify(gltfJson);
            const jsonEncoder = new TextEncoder();
            let jsonBytes = jsonEncoder.encode(jsonStr);
            const jsonPad = align4(jsonBytes.byteLength);
            if (jsonPad > 0) {
                const padded = new Uint8Array(jsonBytes.byteLength + jsonPad);
                padded.set(jsonBytes);
                for (let i = 0; i < jsonPad; i++) padded[jsonBytes.byteLength + i] = 0x20;
                jsonBytes = padded;
            }

            const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + totalByteLength;
            const glb = new Uint8Array(totalLength);
            const dv = new DataView(glb.buffer);

            dv.setUint32(0, 0x46546C67, true);
            dv.setUint32(4, 2, true);
            dv.setUint32(8, totalLength, true);

            dv.setUint32(12, jsonBytes.byteLength, true);
            dv.setUint32(16, 0x4E4F534A, true);
            glb.set(jsonBytes, 20);

            const binStart = 20 + jsonBytes.byteLength;
            dv.setUint32(binStart, totalByteLength, true);
            dv.setUint32(binStart + 4, 0x004E4942, true);
            let offset = binStart + 8;
            for (const chunk of binChunks) {
                glb.set(chunk, offset);
                offset += chunk.byteLength;
            }

            let binary = '';
            const step = 32768;
            for (let i = 0; i < glb.byteLength; i += step) {
                binary += String.fromCharCode.apply(null, glb.subarray(i, i + step));
            }
            return JSON.stringify({
                meshCount: meshes.length,
                rawVertTotal,
                weldedVertTotal,
                byteLength: totalLength,
                b64: btoa(binary)
            });
        })()
        """
        send_ws({
            'id': 2,
            'method': 'Runtime.evaluate',
            'params': {
                'expression': js_extract,
                'returnByValue': True
            }
        })
        res = recv_ws_json()
        val_str = res.get('result', {}).get('result', {}).get('value')
        if not val_str:
            print("Error from CDP:", res)
            sys.exit(1)

        payload = json.loads(val_str)
        glb_bytes = base64.b64decode(payload['b64'])
        os.makedirs(os.path.dirname(OUTPUT_GLB), exist_ok=True)
        with open(OUTPUT_GLB, 'wb') as f:
            f.write(glb_bytes)

        mb = len(glb_bytes) / (1024 * 1024)
        print(f"[4/4] Successfully built {OUTPUT_GLB}!")
        print(f"      Extracted Meshes: {payload['meshCount']}")
        print(f"      Vertices Welded: {payload['rawVertTotal']:,} -> {payload['weldedVertTotal']:,}")
        print(f"      Output Size: {mb:.2f} MB (down from 17.55 MB VisceralSystem.fbx)")
    finally:
        proc.terminate()

if __name__ == '__main__':
    build_digestive_glb()
