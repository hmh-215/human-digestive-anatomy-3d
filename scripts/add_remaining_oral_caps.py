"""
scripts/add_remaining_oral_caps.py
Generates and appends cross-section caps at midsagittal plane x=0 for:
1. Palate_Cap (Khẩu cái mềm & Lưỡi gà / Velum Palatinum & Uvula)
2. Epiglottis_Cap (Nắp thanh môn / Epiglottis)
3. Hyoid_Bone_Cap (Xương móng / Hyoid Bone)
"""
import struct
import json
import numpy as np
from collections import defaultdict
from shapely.geometry import Polygon
from shapely.ops import unary_union, triangulate

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

def get_poly_from_mesh(mesh_name):
    n = next(x for x in gltf['nodes'] if x['name'] == mesh_name)
    m = gltf['meshes'][n['mesh']]
    prim = m['primitives'][0]
    pos = get_accessor_data(prim['attributes']['POSITION'])
    idx = get_accessor_data(prim['indices'])
    tris = idx.reshape(-1, 3)

    edge_to_pt = {}
    xs = pos[:, 0].copy()
    xs[np.abs(xs) < 1e-7] = 1e-7
    tri_segments = []
    for t in tris:
        t_xs = xs[t]
        if np.all(t_xs > 0) or np.all(t_xs < 0):
            continue
        crossing = []
        for i in range(3):
            i1, i2 = int(t[i]), int(t[(i+1)%3])
            x1, x2 = t_xs[i], t_xs[(i+1)%3]
            if (x1 < 0 and x2 > 0) or (x1 > 0 and x2 < 0):
                e = tuple(sorted((i1, i2)))
                if e not in edge_to_pt:
                    tv = -x1 / (x2 - x1)
                    ip = pos[i1] + tv * (pos[i2] - pos[i1])
                    edge_to_pt[e] = (float(ip[1]), float(ip[2]))
                crossing.append(e)
        if len(crossing) == 2:
            tri_segments.append(crossing)

    adj = defaultdict(list)
    for e1, e2 in tri_segments:
        adj[e1].append(e2)
        adj[e2].append(e1)

    start = list(adj.keys())[0]
    curr = start
    prev = None
    loop = [start]
    visited = {start}
    while True:
        nbrs = [nbr for nbr in adj[curr] if nbr != prev and nbr not in visited]
        if not nbrs:
            break
        nxt = nbrs[0]
        loop.append(nxt)
        visited.add(nxt)
        prev = curr
        curr = nxt

    coords_2d = [edge_to_pt[e] for e in loop]
    poly = Polygon(coords_2d)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly

def triangulate_cap(poly, cap_name):
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
            k = (round(cy, 5), round(cz, 5))
            if k not in vert_map:
                vert_map[k] = len(verts_3d)
                verts_3d.append([0.0, k[0], k[1]])
            tri_idx.append(vert_map[k])
        p0, p1, p2 = np.array(verts_3d[tri_idx[0]]), np.array(verts_3d[tri_idx[1]]), np.array(verts_3d[tri_idx[2]])
        # Cross product (p1 - p0) x (p2 - p0):
        # cross_x = (p1_y - p0_y)*(p2_z - p0_z) - (p1_z - p0_z)*(p2_y - p0_y)
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
    print(f"  Generated {cap_name}: {len(verts_arr)} verts, {len(idx_arr)//3} tris, Y=[{min_y:.2f}, {max_y:.2f}], Z=[{min_z:.2f}, {max_z:.2f}]")
    return verts_arr, norms_arr, uvs_arr, idx_arr

print("[1/3] Slicing and triangulating structures...")
p_sp = get_poly_from_mesh('Soft_palate')
p_uv = get_poly_from_mesh('Uvula_of_palate')
p_palate = unary_union([p_sp, p_uv])

p_epi = get_poly_from_mesh('Epiglottis')
p_hyoid = get_poly_from_mesh('Hyoid_bone')

new_caps = [
    triangulate_cap(p_palate, 'Palate_Cap'),
    triangulate_cap(p_epi, 'Epiglottis_Cap'),
    triangulate_cap(p_hyoid, 'Hyoid_Bone_Cap')
]
cap_names = ['Palate_Cap', 'Epiglottis_Cap', 'Hyoid_Bone_Cap']

print("\n[2/3] Appending new caps to glTF accessors and nodes...")
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

# Check if any cap nodes already exist (e.g. from prior runs)
existing_names = {n['name']: i for i, n in enumerate(gltf['nodes'])}

for name, (v, nm, uv, ind) in zip(cap_names, new_caps):
    if name in existing_names:
        print(f"  Warning: {name} already exists in GLTF nodes, skipping append")
        continue

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
        'name': name,
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
        'name': name,
        'mesh': mesh_idx
    })
    gltf['scenes'][0]['nodes'].append(node_idx)
    print(f"  Added node & mesh {name} (node #{node_idx}) to GLTF scene")

gltf['buffers'][0]['byteLength'] = len(bin_data)

print("\n[3/3] Packing and saving UpperDigestiveTract.glb...")
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
