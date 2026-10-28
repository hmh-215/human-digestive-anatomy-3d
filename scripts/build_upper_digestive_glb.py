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
OUTPUT_GLB = os.path.join(WORKSPACE, 'assets', 'models', 'UpperDigestiveTract.glb')

def build_upper_glb():
    print("[1/4] Launching headless Edge to parse VisceralSystem.fbx & SkeletalSystem.fbx...")
    proc = subprocess.Popen([
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--headless',
        '--window-size=1200,800',
        '--remote-debugging-port=9230',
        'http://localhost:8085/'
    ])
    time.sleep(3)

    try:
        with urllib.request.urlopen('http://localhost:9230/json') as resp:
            tabs = json.load(resp)
        target_tab = [t for t in tabs if '8085' in t.get('url', '')][0]
        ws_url = target_tab['webSocketDebuggerUrl']
        host = 'localhost'
        port = 9230
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

        print("[2/4] Loading FBX models and collecting Upper GI meshes...")
        js_script = """
        (async () => {
            try {
                const THREE = await import('./assets/libs/three/build/three.module.js');
                const { FBXLoader } = await import('./assets/libs/three/examples/jsm/loaders/FBXLoader.js');
                const loader = new FBXLoader();

                console.log("Loading VisceralSystem.fbx...");
                const visceral = await new Promise((res, rej) => {
                    loader.load('./assets/models/VisceralSystem.fbx', res, undefined, rej);
                });

                console.log("Loading SkeletalSystem.fbx...");
                const skeletal = await new Promise((res, rej) => {
                    loader.load('./assets/models/SkeletalSystem.fbx', res, undefined, rej);
                });

                const targetMeshes = [];

                // 1. Visceral meshes
                const visceralMap = {
                    'tongue': 'tongue',
                    'laryngopharynx': 'pharynx',
                    'oropharynx': 'pharynx',
                    'nasopharynx': 'pharynx',
                    'soft_palate': 'palate',
                    'uvula_of_palate': 'palate',
                    'epiglottis': 'epiglottis',
                    'parotid_glandl': 'salivary_gland',
                    'parotid_glandr': 'salivary_gland',
                    '(accessory_parotid_gland)l': 'salivary_gland',
                    '(accessory_parotid_gland)r': 'salivary_gland',
                    'submandibular_glandl': 'salivary_gland',
                    'submandibular_glandr': 'salivary_gland',
                    'sublingual_glandl': 'salivary_gland',
                    'sublingual_glandr': 'salivary_gland',
                    'gingiva': 'gingiva'
                };

                visceral.traverse(c => {
                    if (c.isMesh) {
                        const low = c.name.toLowerCase();
                        if (visceralMap[low]) {
                            targetMeshes.push({
                                mesh: c,
                                name: c.name,
                                organId: visceralMap[low]
                            });
                        }
                    }
                });

                // 2. Skeletal meshes: Mandible, Maxilla, Hyoid, Teeth
                const teethUpper = [];
                const teethLower = [];

                skeletal.traverse(c => {
                    if (c.isMesh) {
                        const low = c.name.toLowerCase();
                        if (c.name === 'Mandible') {
                            targetMeshes.push({ mesh: c, name: 'Mandible', organId: 'mandible' });
                        } else if (c.name === 'Maxillal' || c.name === 'Maxillar') {
                            targetMeshes.push({ mesh: c, name: c.name, organId: 'maxilla' });
                        } else if (c.name === 'Hyoid_bone') {
                            targetMeshes.push({ mesh: c, name: 'Hyoid_bone', organId: 'hyoid_bone' });
                        } else if (low.includes('incisor') || low.includes('canine') || low.includes('premolar') || low.includes('molar')) {
                            // Check if real tooth mesh (not marker/surface)
                            if (!low.endsWith('j') && !low.endsWith('t') && !low.endsWith('i') && !low.endsWith('s') && !low.endsWith('.g')) {
                                if (low.startsWith('lower')) {
                                    teethLower.push(c);
                                } else if (low.startsWith('upper')) {
                                    teethUpper.push(c);
                                }
                            }
                        }
                    }
                });

                // Group teeth into Upper_Teeth and Lower_Teeth
                teethUpper.forEach(t => {
                    targetMeshes.push({ mesh: t, name: t.name, organId: 'teeth' });
                });
                teethLower.forEach(t => {
                    targetMeshes.push({ mesh: t, name: t.name, organId: 'teeth' });
                });

                console.log("Total meshes to weld & export:", targetMeshes.length);

                // Vertex welding & GLB build
                const Vector3 = THREE.Vector3;
                const Quaternion = THREE.Quaternion;
                const v = new Vector3();
                const n = new Vector3();
                const worldQuat = new Quaternion();

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
                    if (pad > 0) binChunks.push(new Uint8Array(pad));
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

                targetMeshes.forEach((item) => {
                    const mesh = item.mesh;
                    mesh.updateWorldMatrix(true, false);
                    const matWorld = mesh.matrixWorld;
                    mesh.getWorldQuaternion(worldQuat);

                    const geo = mesh.geometry;
                    const posAttr = geo.attributes.position;
                    const normAttr = geo.attributes.normal;
                    const inCount = posAttr.count;
                    rawVertTotal += inCount;

                    const vertMap = new Map();
                    const uniquePos = [];
                    const uniqueNorm = [];
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

                        // Spatial hash quantization: 0.05mm
                        const kx = Math.round(vx * 2000);
                        const ky = Math.round(vy * 2000);
                        const kz = Math.round(vz * 2000);
                        const knx = Math.round(nx * 50);
                        const kny = Math.round(ny * 50);
                        const key = `${kx}_${ky}_${kz}_${knx}_${kny}`;

                        let idx = vertMap.get(key);
                        if (idx === undefined) {
                            idx = uniqueCount++;
                            vertMap.set(key, idx);
                            uniquePos.push(vx, vy, vz);
                            uniqueNorm.push(nx, ny, nz);

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
                            attributes: { POSITION: posAcc, NORMAL: normAcc },
                            indices: idxAcc
                        }]
                    });

                    nodes.push({
                        name: item.name,
                        mesh: meshIdx,
                        extras: { organId: item.organId }
                    });
                });

                const gltfJson = {
                    asset: { version: '2.0', generator: 'Z-Anatomy Upper Digestive GLB Exporter' },
                    scenes: [{ name: 'UpperDigestiveTract', nodes: nodes.map((_, idx) => idx) }],
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

                return {
                    meshCount: meshes.length,
                    rawVertTotal,
                    weldedVertTotal,
                    byteLength: totalLength,
                    b64: btoa(binary)
                };
            } catch (err) {
                return { error: err.message, stack: err.stack };
            }
        })()
        """
        print("[3/4] Welding vertices & building indexed GLB...")
        send_ws({
            'id': 1,
            'method': 'Runtime.evaluate',
            'params': {
                'expression': js_script,
                'awaitPromise': True,
                'returnByValue': True
            }
        })
        res = recv_ws_json()
        val = res.get('result', {}).get('result', {}).get('value', {})
        if val.get('error'):
            print("Error during build:", val['error'])
            print(val.get('stack'))
            sys.exit(1)

        b64_data = val.get('b64')
        if not b64_data:
            print("No GLB data returned:", val)
            sys.exit(1)

        glb_bytes = base64.b64decode(b64_data)
        os.makedirs(os.path.dirname(OUTPUT_GLB), exist_ok=True)
        with open(OUTPUT_GLB, 'wb') as f:
            f.write(glb_bytes)

        mb = len(glb_bytes) / (1024 * 1024)
        print(f"[4/4] Successfully built {OUTPUT_GLB}!")
        print(f"      Extracted Meshes: {val['meshCount']}")
        print(f"      Vertices Welded: {val['rawVertTotal']:,} -> {val['weldedVertTotal']:,}")
        print(f"      Output Size: {mb:.2f} MB")

    finally:
        proc.terminate()

if __name__ == '__main__':
    build_upper_glb()
