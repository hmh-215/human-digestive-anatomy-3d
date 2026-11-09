"""
scripts/fix_upper_digestive_glb.py
1. Fixes inverted normals and inverted triangle winding in all mirrored meshes in UpperDigestiveTract.glb.
2. Generates and inserts Tongue_Cap and Mandible_Cap at midsagittal plane x=0.
"""
import struct
import json
import numpy as np
from collections import defaultdict
from shapely.geometry import Polygon
from shapely.ops import triangulate

GLB_PATH = 'assets/models/UpperDigestiveTract.glb'

with open(GLB_PATH, 'rb') as f:
    magic, ver, total_len = struct.unpack('<4sII', f.read(12))
    jlen, jtype = struct.unpack('<II', f.read(8))
    gltf = json.loads(f.read(jlen).decode('utf-8'))
    blen, btype = struct.unpack('<II', f.read(8))
    bin_data = bytearray(f.read(blen))

accessors = gltf['accessors']
bufferViews = gltf['bufferViews']

def get_accessor_data(acc_idx):
    acc = accessors[acc_idx]
    bv = bufferViews[acc['bufferView']]
    offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    count = acc['count']
    type_str = acc['type']
    comp_type = acc['componentType']
    if comp_type == 5126: # float
        n_comp = 3 if type_str == 'VEC3' else (2 if type_str == 'VEC2' else 1)
        data = np.frombuffer(bin_data, offset=offset, count=count*n_comp, dtype=np.float32).copy()
        return data.reshape(count, n_comp)
    elif comp_type == 5123: # uint16
        return np.frombuffer(bin_data, offset=offset, count=count, dtype=np.uint16).copy()
    elif comp_type == 5125: # uint32
        return np.frombuffer(bin_data, offset=offset, count=count, dtype=np.uint32).copy()

def set_accessor_data(acc_idx, new_data):
    acc = accessors[acc_idx]
    bv = bufferViews[acc['bufferView']]
    offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    raw = new_data.tobytes()
    bin_data[offset:offset+len(raw)] = raw

def compute_smooth_normals(pos, tris):
    n_verts = len(pos)
    v_a = pos[tris[:, 0]]
    v_b = pos[tris[:, 1]]
    v_c = pos[tris[:, 2]]
    e1 = v_b - v_a
    e2 = v_c - v_a
    fn = np.cross(e1, e2) # Face normals weighted by 2 * triangle area

    v_norms = np.zeros((n_verts, 3), dtype=np.float32)
    for i in range(len(tris)):
        f = fn[i]
        v_norms[tris[i, 0]] += f
        v_norms[tris[i, 1]] += f
        v_norms[tris[i, 2]] += f

    lens = np.linalg.norm(v_norms, axis=1, keepdims=True)
    valid = (lens[:, 0] > 1e-8)
    v_norms[valid] /= lens[valid]
    v_norms[~valid] = [0, 0, 1]
    return v_norms

print("[1/3] Fixing inverted meshes and normals...")
fixed_count = 0
for n in gltf['nodes']:
    mid = n.get('mesh')
    if mid is None: continue
    m = gltf['meshes'][mid]
    prim = m['primitives'][0]
    pos = get_accessor_data(prim['attributes']['POSITION'])
    idx = get_accessor_data(prim['indices'])
    tris = idx.reshape(-1, 3)

    # Compute signed volume
    v_a = pos[tris[:, 0]]
    v_b = pos[tris[:, 1]]
    v_c = pos[tris[:, 2]]
    cross_bc = np.cross(v_b, v_c)
    signed_vol = np.sum(v_a * cross_bc) / 6.0

    low = n['name'].lower()
    needs_flip = signed_vol < 0

    if needs_flip:
        # Invert triangle winding so face normals point outward
        tris = tris[:, [0, 2, 1]]
        idx = tris.reshape(-1)
        set_accessor_data(prim['indices'], idx)
        print(f"  Flipped winding for {n['name']} (signed volume: {signed_vol:.2f} -> {-signed_vol:.2f})")

    # Recompute vertex normals to guarantee smooth, correct outward normals
    new_norms = compute_smooth_normals(pos, tris)
    if 'NORMAL' in prim['attributes']:
        set_accessor_data(prim['attributes']['NORMAL'], new_norms)
    fixed_count += 1

print(f"Fixed normals and winding on {fixed_count} meshes.")

print("\n[2/3] Generating Tongue_Cap and Mandible_Cap...")
def generate_cap(mesh_name, pos, idx):
    tris = idx.reshape(-1, 3)
    segments = []
    for t in tris:
        pts = pos[t]
        xs = pts[:, 0]
        if np.all(xs > 0) or np.all(xs < 0):
            continue
        inter_pts = []
        for i in range(3):
            p1 = pts[i]
            p2 = pts[(i + 1) % 3]
            x1, x2 = p1[0], p2[0]
            if (x1 < 0 and x2 > 0) or (x1 > 0 and x2 < 0):
                t_val = -x1 / (x2 - x1)
                ip = p1 + t_val * (p2 - p1)
                inter_pts.append(ip)
            elif abs(x1) < 1e-6:
                inter_pts.append(p1)
        if len(inter_pts) == 2:
            segments.append((inter_pts[0], inter_pts[1]))

    adj = defaultdict(list)
    for s0, s1 in segments:
        k0 = (round(s0[1], 4), round(s0[2], 4))
        k1 = (round(s1[1], 4), round(s1[2], 4))
        if k0 == k1: continue
        adj[k0].append(k1)
        adj[k1].append(k0)

    for k in adj:
        adj[k] = list(set(adj[k]))

    start = list(adj.keys())[0]
    curr = start
    prev = None
    loop_2d = [curr]
    while True:
        nbrs = [n for n in adj[curr] if n != prev]
        if not nbrs: break
        nxt = nbrs[0]
        if nxt == start: break
        loop_2d.append(nxt)
        prev = curr
        curr = nxt

    poly = Polygon(loop_2d)
    if not poly.is_valid:
        poly = poly.buffer(0)

    raw_tris = triangulate(poly)
    cap_tris_coords = []
    for t in raw_tris:
        if poly.contains(t.centroid) or poly.buffer(1e-4).contains(t.centroid):
            coords = list(t.exterior.coords)[:3]
            cap_tris_coords.append(coords)

    vert_map = {}
    verts_3d = []
    indices = []
    for c0, c1, c2 in cap_tris_coords:
        tri_idx = []
        for cy, cz in [c0, c1, c2]:
            k = (round(cy, 4), round(cz, 4))
            if k not in vert_map:
                vert_map[k] = len(verts_3d)
                verts_3d.append([0.0, k[0], k[1]])
            tri_idx.append(vert_map[k])
        p0, p1, p2 = np.array(verts_3d[tri_idx[0]]), np.array(verts_3d[tri_idx[1]]), np.array(verts_3d[tri_idx[2]])
        cross_x = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1])
        if cross_x < 0:
            tri_idx = [tri_idx[0], tri_idx[2], tri_idx[1]]
        indices.extend(tri_idx)

    verts_arr = np.array(verts_3d, dtype=np.float32)
    norms_arr = np.zeros_like(verts_arr)
    norms_arr[:, 0] = 1.0

    min_y, max_y = verts_arr[:, 1].min(), verts_arr[:, 1].max()
    min_z, max_z = verts_arr[:, 2].min(), verts_arr[:, 2].max()
    uvs_arr = np.zeros((len(verts_arr), 2), dtype=np.float32)
    uvs_arr[:, 0] = (verts_arr[:, 2] - min_z) / max(max_z - min_z, 1e-5)
    uvs_arr[:, 1] = (verts_arr[:, 1] - min_y) / max(max_y - min_y, 1e-5)

    idx_arr = np.array(indices, dtype=np.uint16)
    print(f"  Generated {mesh_name} cap: {len(verts_arr)} verts, {len(idx_arr)//3} tris")
    return verts_arr, norms_arr, uvs_arr, idx_arr

caps_to_add = []
for n in gltf['nodes']:
    if n['name'] in ['Tongue', 'Mandible']:
        mid = n['mesh']
        m = gltf['meshes'][mid]
        prim = m['primitives'][0]
        pos = get_accessor_data(prim['attributes']['POSITION'])
        idx = get_accessor_data(prim['indices'])
        cap_name = f"{n['name']}_Cap"
        v, nm, uv, ind = generate_cap(cap_name, pos, idx)
        caps_to_add.append((cap_name, v, nm, uv, ind))

# Append caps to glTF
def append_buffer(byte_data, target):
    def align4(n): return (4 - (n % 4)) % 4
    pad = align4(len(bin_data))
    if pad > 0:
        bin_data.extend(b'\x00' * pad)
    offset = len(bin_data)
    bin_data.extend(byte_data)
    bv_idx = len(bufferViews)
    bufferViews.append({
        'buffer': 0,
        'byteOffset': offset,
        'byteLength': len(byte_data),
        'target': target
    })
    return bv_idx

for cap_name, v, nm, uv, ind in caps_to_add:
    pos_bv = append_buffer(v.tobytes(), 34962)
    norm_bv = append_buffer(nm.tobytes(), 34962)
    uv_bv = append_buffer(uv.tobytes(), 34962)
    ind_bv = append_buffer(ind.tobytes(), 34963)

    pos_acc = len(accessors)
    accessors.append({
        'bufferView': pos_bv,
        'componentType': 5126,
        'count': len(v),
        'type': 'VEC3',
        'min': [float(x) for x in v.min(axis=0)],
        'max': [float(x) for x in v.max(axis=0)]
    })

    norm_acc = len(accessors)
    accessors.append({
        'bufferView': norm_bv,
        'componentType': 5126,
        'count': len(nm),
        'type': 'VEC3',
        'min': [float(x) for x in nm.min(axis=0)],
        'max': [float(x) for x in nm.max(axis=0)]
    })

    uv_acc = len(accessors)
    accessors.append({
        'bufferView': uv_bv,
        'componentType': 5126,
        'count': len(uv),
        'type': 'VEC2',
        'min': [float(x) for x in uv.min(axis=0)],
        'max': [float(x) for x in uv.max(axis=0)]
    })

    ind_acc = len(accessors)
    accessors.append({
        'bufferView': ind_bv,
        'componentType': 5123,
        'count': len(ind),
        'type': 'SCALAR',
        'min': [int(ind.min())],
        'max': [int(ind.max())]
    })

    mesh_idx = len(gltf['meshes'])
    gltf['meshes'].append({
        'name': cap_name,
        'primitives': [{
            'attributes': {
                'POSITION': pos_acc,
                'NORMAL': norm_acc,
                'TEXCOORD_0': uv_acc
            },
            'indices': ind_acc,
            'mode': 4
        }]
    })

    node_idx = len(gltf['nodes'])
    gltf['nodes'].append({
        'name': cap_name,
        'mesh': mesh_idx
    })
    gltf['scenes'][0]['nodes'].append(node_idx)
    print(f"  Added node & mesh {cap_name} to GLTF scene")

gltf['buffers'][0]['byteLength'] = len(bin_data)

print("\n[3/3] Packing and saving UpperDigestiveTract.glb...")
# Encode JSON chunk
json_str = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
def align4_pad(data, pad_byte):
    rem = len(data) % 4
    if rem > 0:
        data += pad_byte * (4 - rem)
    return data

json_bytes = align4_pad(json_str, b' ')
bin_bytes = align4_pad(bytes(bin_data), b'\x00')

header = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(json_bytes) + 8 + len(bin_bytes))
chunk0 = struct.pack('<II', len(json_bytes), 0x4E4F534A) + json_bytes
chunk1 = struct.pack('<II', len(bin_bytes), 0x004E4942) + bin_bytes

with open(GLB_PATH, 'wb') as f:
    f.write(header)
    f.write(chunk0)
    f.write(chunk1)

print(f"Successfully saved {GLB_PATH} (size: {len(header) + len(chunk0) + len(chunk1):,} bytes)")
