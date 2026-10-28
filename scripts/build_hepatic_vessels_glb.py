import struct
import json
import math
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

WORKSPACE = r'd:\huong\antigravity\digestion_system_study'
OUTPUT_GLB = os.path.join(WORKSPACE, 'assets', 'models', 'HepaticVessels.glb')
BLEND_PATH = r'D:\huong\antigravity\châm cứu\3D-models\Z-Anatomy\Startup.blend'

TARGET_VESSELS = [
    # (Curve Name, OB Name, organId, displayName, baseRadius)
    ('CUHepatic portal vein', 'OBHepatic portal vein', 'portal_vein', 'Thân Tĩnh Mạch Cửa (Vena Portae Hepatis)', 0.0055),
    ('CUSuperior mesenteric vein', 'OBSuperior mesenteric vein', 'portal_vein', 'Tĩnh Mạch Mạc Treo Tràng Trên (V. Mesenterica Superior)', 0.0045),
    ('CUSplenic vein', 'OBSplenic vein', 'portal_vein', 'Tĩnh Mạch Lách (Vena Splenica / Lienalis)', 0.0040),
    ('CUInferior mesenteric vein', 'OBInferior mesenteric vein', 'portal_vein', 'Tĩnh Mạch Mạc Treo Tràng Dưới (V. Mesenterica Inferior)', 0.0030),
    ('CUHepatic veins', 'OBHepatic veins', 'hepatic_veins', 'Các Tĩnh Mạch Trên Gan / Tĩnh Mạch Gan (Venae Hepaticae)', 0.0050),
    ('CUInferior vena cava (abdominal part)', 'OBInferior vena cava (abdominal part)', 'inferior_vena_cava', 'Tĩnh Mạch Chủ Dưới Đoạn Bụng (Vena Cava Inferior)', 0.0110),
    ('CUCoeliac trunk', 'OBCoeliac trunk', 'hepatic_artery', 'Thân Tạng (Truncus Coeliacus)', 0.0040),
    ('CUCommon hepatic artery', 'OBCommon hepatic artery', 'hepatic_artery', 'Động Mạch Gan Chung (Arteria Hepatica Communis)', 0.0035),
    ('CUProper hepatic artery', 'OBProper hepatic artery', 'hepatic_artery', 'Động Mạch Gan Riêng (Arteria Hepatica Propria)', 0.0030),
    ('CUSplenic artery', 'OBSplenic artery', 'hepatic_artery', 'Động Mạch Lách (Arteria Splenica)', 0.0035),
    ('CULeft gastric artery', 'OBLeft gastric artery', 'hepatic_artery', 'Động Mạch Vị Trái (Arteria Gastrica Sinistra)', 0.0025),
    ('CUSuperior mesenteric artery', 'OBSuperior mesenteric artery', 'hepatic_artery', 'Động Mạch Mạc Treo Tràng Trên (Arteria Mesenterica Superior)', 0.0045)
]

def build_hepatic_vessels():
    print("[1/4] Mapping Startup.blend memory blocks...")
    addr_map = {}
    with open(BLEND_PATH, 'rb') as f:
        f.seek(12)
        while True:
            hdr_pos = f.tell()
            hdr = f.read(24)
            if len(hdr) < 24: break
            code, size, addr, sdna_idx, count = struct.unpack('<4sIQII', hdr)
            addr_map[addr] = (hdr_pos + 24, size, code, sdna_idx, count)
            f.seek(size, 1)

    print(f"      Mapped {len(addr_map)} blocks.")

    # 1. Read Object matrices
    ob_matrices = {}
    with open(BLEND_PATH, 'rb') as f:
        for addr, (pos, size, code, sdna, count) in addr_map.items():
            if code == b'OB\x00\x00':
                f.seek(pos)
                data = f.read(size)
                name = data[40:106].split(b'\x00')[0].decode('latin1', errors='ignore')
                for _, ob_name, _, _, _ in TARGET_VESSELS:
                    if name == ob_name:
                        mat = struct.unpack('<16f', data[732:796])
                        ob_matrices[ob_name] = mat

    print(f"[2/4] Extracting vessel splines & evaluating 3D tube geometries...")
    extracted_meshes = []

    with open(BLEND_PATH, 'rb') as f:
        for cu_name, ob_name, organ_id, display_name, def_radius in TARGET_VESSELS:
            ob_mat = ob_matrices.get(ob_name)
            if not ob_mat:
                print(f"Warning: Matrix not found for {ob_name}")
                continue

            # Find Curve block
            cu_found = False
            for addr, (pos, size, code, sdna, count) in addr_map.items():
                if code == b'CU\x00\x00':
                    f.seek(pos)
                    data = f.read(size)
                    name = data[40:106].split(b'\x00')[0].decode('latin1', errors='ignore')
                    if name == cu_name:
                        first_nurb = struct.unpack('<Q', data[200:208])[0]
                        if first_nurb not in addr_map:
                            break
                        npos, nsize, _, _, _ = addr_map[first_nurb]
                        f.seek(npos)
                        ndata = f.read(nsize)
                        pntsu = struct.unpack('<i', ndata[24:28])[0]
                        bezt_ptr = struct.unpack('<Q', ndata[72:80])[0]
                        if bezt_ptr not in addr_map:
                            break
                        bpos, bsize, _, _, bcount = addr_map[bezt_ptr]
                        f.seek(bpos)
                        bezt_data = f.read(bsize)

                        # Parse BezTriples
                        knots = []
                        for i in range(bcount):
                            kdata = bezt_data[i*72 : (i+1)*72]
                            h1 = struct.unpack('<3f', kdata[0:12])
                            co = struct.unpack('<3f', kdata[12:24])
                            h2 = struct.unpack('<3f', kdata[24:36])
                            r = struct.unpack('<f', kdata[44:48])[0]
                            # Blend radius fallback to anatomical default if 0 or 1
                            r_eff = def_radius if (r <= 0.0001 or r > 0.05) else r
                            knots.append({'h1': h1, 'co': co, 'h2': h2, 'radius': r_eff})

                        cu_found = True
                        # Generate 3D Tube Geometry
                        mesh_data = generate_tube_from_knots(knots, ob_mat, cu_name, organ_id, display_name)
                        if mesh_data:
                            extracted_meshes.append(mesh_data)
                        break

            if not cu_found:
                print(f"Warning: Curve {cu_name} not found or has no control points!")

    print(f"[3/4] Assembling GLB with {len(extracted_meshes)} hepatic vessel meshes...")
    glb_bytes = build_glb_binary(extracted_meshes)

    os.makedirs(os.path.dirname(OUTPUT_GLB), exist_ok=True)
    with open(OUTPUT_GLB, 'wb') as f:
        f.write(glb_bytes)

    mb = len(glb_bytes) / (1024 * 1024)
    print(f"[4/4] Successfully built {OUTPUT_GLB}!")
    print(f"      Extracted Vessels: {len(extracted_meshes)}")
    print(f"      Output Size: {mb:.2f} MB")

def transform_point(p, mat):
    # mat is 16 floats (column-major)
    x = p[0]*mat[0] + p[1]*mat[4] + p[2]*mat[8] + mat[12]
    y = p[0]*mat[1] + p[1]*mat[5] + p[2]*mat[9] + mat[13]
    z = p[0]*mat[2] + p[1]*mat[6] + p[2]*mat[10] + mat[14]
    # Blender -> Three.js Centimeters:
    # Three.js X = Blender X * 100
    # Three.js Y = Blender Z * 100 (height)
    # Three.js Z = -Blender Y * 100
    return (x * 100.0, z * 100.0, -y * 100.0)

def generate_tube_from_knots(knots, ob_mat, cu_name, organ_id, display_name):
    if len(knots) < 2:
        return None

    # Sample points along cubic Bezier segments
    sampled_points = []
    sampled_radii = []

    subdiv = 8 # points per segment
    for i in range(len(knots) - 1):
        k0 = knots[i]
        k1 = knots[i+1]
        p0 = transform_point(k0['co'], ob_mat)
        p1 = transform_point(k0['h2'], ob_mat)
        p2 = transform_point(k1['h1'], ob_mat)
        p3 = transform_point(k1['co'], ob_mat)
        r0 = k0['radius'] * 100.0 # in cm
        r1 = k1['radius'] * 100.0

        n_steps = subdiv if i == len(knots) - 2 else (subdiv - 1)
        for s in range(n_steps + 1):
            t = s / subdiv
            # Cubic Bezier
            u = 1.0 - t
            bx = u*u*u * p0[0] + 3*u*u*t * p1[0] + 3*u*t*t * p2[0] + t*t*t * p3[0]
            by = u*u*u * p0[1] + 3*u*u*t * p1[1] + 3*u*t*t * p2[1] + t*t*t * p3[1]
            bz = u*u*u * p0[2] + 3*u*u*t * p1[2] + 3*u*t*t * p2[2] + t*t*t * p3[2]
            br = (1.0 - t) * r0 + t * r1
            sampled_points.append((bx, by, bz))
            sampled_radii.append(br)

    # Build Parallel Transport frames along curve
    N_pts = len(sampled_points)
    if N_pts < 2:
        return None

    rad_segs = 12 # radial cylinder resolution
    positions = []
    normals = []
    indices = []

    # Compute tangents
    tangents = []
    for i in range(N_pts):
        if i == 0:
            tx = sampled_points[1][0] - sampled_points[0][0]
            ty = sampled_points[1][1] - sampled_points[0][1]
            tz = sampled_points[1][2] - sampled_points[0][2]
        elif i == N_pts - 1:
            tx = sampled_points[-1][0] - sampled_points[-2][0]
            ty = sampled_points[-1][1] - sampled_points[-2][1]
            tz = sampled_points[-1][2] - sampled_points[-2][2]
        else:
            tx = sampled_points[i+1][0] - sampled_points[i-1][0]
            ty = sampled_points[i+1][1] - sampled_points[i-1][1]
            tz = sampled_points[i+1][2] - sampled_points[i-1][2]
        length = math.sqrt(tx*tx + ty*ty + tz*tz)
        if length > 1e-6:
            tx /= length; ty /= length; tz /= length
        else:
            tx, ty, tz = 0, 1, 0
        tangents.append((tx, ty, tz))

    # Initial normal vector perpendicular to first tangent
    t0 = tangents[0]
    up = (0, 1, 0) if (abs(t0[1]) < 0.9) else (1, 0, 0)
    # nx = up x t0
    nx = up[1]*t0[2] - up[2]*t0[1]
    ny = up[2]*t0[0] - up[0]*t0[2]
    nz = up[0]*t0[1] - up[1]*t0[0]
    nlen = math.sqrt(nx*nx + ny*ny + nz*nz)
    nx /= nlen; ny /= nlen; nz /= nlen

    # bx = t0 x n
    bx = t0[1]*nz - t0[2]*ny
    by = t0[2]*nx - t0[0]*nz
    bz = t0[0]*ny - t0[1]*nx

    frames = [( (nx, ny, nz), (bx, by, bz) )]

    # Parallel transport to next points
    for i in range(1, N_pts):
        prev_t = tangents[i-1]
        curr_t = tangents[i]
        # cross = prev_t x curr_t
        ax = prev_t[1]*curr_t[2] - prev_t[2]*curr_t[1]
        ay = prev_t[2]*curr_t[0] - prev_t[0]*curr_t[2]
        az = prev_t[0]*curr_t[1] - prev_t[1]*curr_t[0]
        angle = math.acos(max(-1.0, min(1.0, prev_t[0]*curr_t[0] + prev_t[1]*curr_t[1] + prev_t[2]*curr_t[2])))

        prev_n, prev_b = frames[-1]
        if abs(angle) > 1e-4 and (ax*ax + ay*ay + az*az) > 1e-8:
            # Rotate prev_n around a
            alen = math.sqrt(ax*ax + ay*ay + az*az)
            ax /= alen; ay /= alen; az /= alen
            # Rodrigues rotation
            curr_n = rodrigues_rotate(prev_n, (ax, ay, az), angle)
            curr_b = (curr_t[1]*curr_n[2] - curr_t[2]*curr_n[1],
                      curr_t[2]*curr_n[0] - curr_t[0]*curr_n[2],
                      curr_t[0]*curr_n[1] - curr_t[1]*curr_n[0])
        else:
            curr_n = prev_n
            curr_b = prev_b
        frames.append((curr_n, curr_b))

    # Generate rings of vertices
    for i in range(N_pts):
        pt = sampled_points[i]
        rad = sampled_radii[i]
        n_vec, b_vec = frames[i]

        for j in range(rad_segs):
            theta = 2.0 * math.pi * j / rad_segs
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)

            # radial normal
            rnx = cos_t * n_vec[0] + sin_t * b_vec[0]
            rny = cos_t * n_vec[1] + sin_t * b_vec[1]
            rnz = cos_t * n_vec[2] + sin_t * b_vec[2]

            vx = pt[0] + rad * rnx
            vy = pt[1] + rad * rny
            vz = pt[2] + rad * rnz

            positions.extend([vx, vy, vz])
            normals.extend([rnx, rny, rnz])

    # Connect rings into quad pairs (2 triangles per quad)
    for i in range(N_pts - 1):
        ring1 = i * rad_segs
        ring2 = (i + 1) * rad_segs
        for j in range(rad_segs):
            j_next = (j + 1) % rad_segs
            v0 = ring1 + j
            v1 = ring1 + j_next
            v2 = ring2 + j
            v3 = ring2 + j_next

            indices.extend([v0, v2, v1])
            indices.extend([v1, v2, v3])

    clean_name = cu_name.replace('CU', '').replace(' ', '_').replace('(', '').replace(')', '')
    return {
        'name': clean_name,
        'organId': organ_id,
        'displayName': display_name,
        'positions': positions,
        'normals': normals,
        'indices': indices
    }

def rodrigues_rotate(v, k, theta):
    # v * cos(theta) + (k x v) * sin(theta) + k * (k . v) * (1 - cos(theta))
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    kxv = (k[1]*v[2] - k[2]*v[1], k[2]*v[0] - k[0]*v[2], k[0]*v[1] - k[1]*v[0])
    k_dot_v = k[0]*v[0] + k[1]*v[1] + k[2]*v[2]
    return (
        v[0]*cos_t + kxv[0]*sin_t + k[0]*k_dot_v*(1.0 - cos_t),
        v[1]*cos_t + kxv[1]*sin_t + k[1]*k_dot_v*(1.0 - cos_t),
        v[2]*cos_t + kxv[2]*sin_t + k[2]*k_dot_v*(1.0 - cos_t)
    )

def build_glb_binary(meshes_data):
    buffer_views = []
    accessors = []
    meshes = []
    nodes = []
    bin_chunks = []
    total_byte_length = 0

    def align4(l): return (4 - (l % 4)) % 4

    def add_data(byte_data, target):
        nonlocal total_byte_length
        pad = align4(len(byte_data))
        offset = total_byte_length
        bin_chunks.append(byte_data)
        if pad > 0:
            bin_chunks.append(b'\x00' * pad)
        total_byte_length += len(byte_data) + pad
        bv_idx = len(buffer_views)
        buffer_views.append({
            'buffer': 0,
            'byteOffset': offset,
            'byteLength': len(byte_data),
            'target': target
        })
        return bv_idx

    for item in meshes_data:
        pos_arr = item['positions']
        norm_arr = item['normals']
        idx_arr = item['indices']
        vert_cnt = len(pos_arr) // 3

        min_x = min(pos_arr[0::3]); max_x = max(pos_arr[0::3])
        min_y = min(pos_arr[1::3]); max_y = max(pos_arr[1::3])
        min_z = min(pos_arr[2::3]); max_z = max(pos_arr[2::3])

        pos_bytes = struct.pack(f'<{len(pos_arr)}f', *pos_arr)
        norm_bytes = struct.pack(f'<{len(norm_arr)}f', *norm_arr)

        pos_bv = add_data(pos_bytes, 34962)
        pos_acc = len(accessors)
        accessors.append({
            'bufferView': pos_bv,
            'componentType': 5126,
            'count': vert_cnt,
            'type': 'VEC3',
            'min': [min_x, min_y, min_z],
            'max': [max_x, max_y, max_z]
        })

        norm_bv = add_data(norm_bytes, 34962)
        norm_acc = len(accessors)
        accessors.append({
            'bufferView': norm_bv,
            'componentType': 5126,
            'count': vert_cnt,
            'type': 'VEC3'
        })

        use_u32 = vert_cnt > 65535
        idx_fmt = f'<{len(idx_arr)}I' if use_u32 else f'<{len(idx_arr)}H'
        idx_type = 5125 if use_u32 else 5123
        idx_bytes = struct.pack(idx_fmt, *idx_arr)
        idx_bv = add_data(idx_bytes, 34963)
        idx_acc = len(accessors)
        accessors.append({
            'bufferView': idx_bv,
            'componentType': idx_type,
            'count': len(idx_arr),
            'type': 'SCALAR'
        })

        mesh_idx = len(meshes)
        meshes.append({
            'name': item['name'],
            'primitives': [{
                'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                'indices': idx_acc
            }]
        })

        nodes.append({
            'name': item['name'],
            'mesh': mesh_idx,
            'extras': {
                'organId': item['organId'],
                'displayName': item['displayName']
            }
        })

    gltf_json = {
        'asset': {'version': '2.0', 'generator': 'Z-Anatomy Hepatic Vessels Tube Synthesizer'},
        'scenes': [{'name': 'HepaticVessels', 'nodes': list(range(len(nodes)))}],
        'scene': 0,
        'nodes': nodes,
        'meshes': meshes,
        'accessors': accessors,
        'bufferViews': buffer_views,
        'buffers': [{'byteLength': total_byte_length}]
    }

    json_str = json.dumps(gltf_json)
    json_bytes = json_str.encode('utf-8')
    pad_json = align4(len(json_bytes))
    if pad_json > 0:
        json_bytes += b' ' * pad_json

    total_len = 12 + 8 + len(json_bytes) + 8 + total_byte_length
    out = bytearray(total_len)

    struct.pack_into('<4sII', out, 0, b'glTF', 2, total_len)
    struct.pack_into('<II', out, 12, len(json_bytes), 0x4E4F534A)
    out[20 : 20 + len(json_bytes)] = json_bytes

    bin_start = 20 + len(json_bytes)
    struct.pack_into('<II', out, bin_start, total_byte_length, 0x004E4942)
    cur = bin_start + 8
    for chunk in bin_chunks:
        out[cur : cur + len(chunk)] = chunk
        cur += len(chunk)

    return bytes(out)

if __name__ == '__main__':
    build_hepatic_vessels()
