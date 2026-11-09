"""
scripts/patch_stomach_glb.py
Seals the 78-vertex artificial circular hole on the anterior wall of the stomach in DigestiveSystem.glb.
Maintains continuous smooth curvature, outward normals, and continuous UV coordinates.
"""
import struct
import json
import numpy as np
from collections import defaultdict
import os

GLB_PATH = 'assets/models/DigestiveSystem.glb'
BAK_PATH = 'assets/models/DigestiveSystem.glb.bak'

if not os.path.exists(BAK_PATH):
    import shutil
    shutil.copyfile(GLB_PATH, BAK_PATH)
    print(f"Backed up {GLB_PATH} to {BAK_PATH}")

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

stomach_mesh_idx = 16
stomach_mesh = gltf['meshes'][stomach_mesh_idx]
prim = stomach_mesh['primitives'][0]

pos_acc_idx = prim['attributes']['POSITION']
norm_acc_idx = prim['attributes']['NORMAL']
uv_acc_idx = prim['attributes']['TEXCOORD_0']
idx_acc_idx = prim['indices']

pos = get_accessor_data(pos_acc_idx)
norm = get_accessor_data(norm_acc_idx)
uv = get_accessor_data(uv_acc_idx)
idx = get_accessor_data(idx_acc_idx)
triangles = idx.reshape(-1, 3)

print(f"Stomach initial: {len(pos)} vertices, {len(triangles)} triangles")

# Find boundary directed edges
edge_count = defaultdict(int)
edge_dir = {}
for a, b, c in triangles:
    for u, v in [(a, b), (b, c), (c, a)]:
        edge_count[tuple(sorted((u, v)))] += 1
        edge_dir[(u, v)] = True

boundary_directed = []
for (u, v) in edge_dir:
    if edge_count[tuple(sorted((u, v)))] == 1:
        boundary_directed.append((u, v))

# Chain directed hole loop (anterior wall: z > 7.0)
adj = defaultdict(list)
for u, v in boundary_directed:
    if pos[u, 2] > 7.0 and pos[v, 2] > 7.0:
        adj[u].append(v)

start = list(adj.keys())[0]
curr = start
hole_loop = [curr]
while True:
    nxt = adj[curr][0]
    if nxt == start: break
    hole_loop.append(nxt)
    curr = nxt

N = len(hole_loop)
print(f"Directed hole loop: {N} vertices")

loop_pos = pos[hole_loop]
loop_norm = norm[hole_loop]
loop_uv = uv[hole_loop]
center = np.mean(loop_pos, axis=0)
center_uv = np.mean(loop_uv, axis=0)
mean_n = np.mean(loop_norm, axis=0)
mean_n = mean_n / np.linalg.norm(mean_n)
h = 0.55 # Outward dome height

new_pos = list(pos)
new_norm = list(norm)
new_uv = list(uv)
new_tris = []

# Generate 3 concentric rings
n_rings = 3
ring_indices = [hole_loop]

for r in range(1, n_rings + 1):
    frac = 1.0 - (r / (n_rings + 1))
    bulge = h * (1.0 - frac**2)
    cur_ring = []
    for i in range(N):
        p_i = loop_pos[i]
        p_new = center + (p_i - center) * frac + mean_n * bulge
        n_new = loop_norm[i] * frac + mean_n * (1.0 - frac)
        n_new /= np.linalg.norm(n_new)
        uv_new = center_uv + (loop_uv[i] - center_uv) * frac

        idx_new = len(new_pos)
        new_pos.append(p_new)
        new_norm.append(n_new)
        new_uv.append(uv_new)
        cur_ring.append(idx_new)
    ring_indices.append(cur_ring)

# Center apex vertex
c_idx = len(new_pos)
new_pos.append(center + mean_n * h)
new_norm.append(mean_n)
new_uv.append(center_uv)

# Stitch concentric rings with opposite winding (o2, o1) to seal directed boundary
for r in range(n_rings):
    r_outer = ring_indices[r]
    r_inner = ring_indices[r + 1]
    for i in range(N):
        i_next = (i + 1) % N
        o1 = r_outer[i]
        o2 = r_outer[i_next]
        i1 = r_inner[i]
        i2 = r_inner[i_next]
        new_tris.append([o2, o1, i1])
        new_tris.append([o2, i1, i2])

# Innermost ring to center
r_last = ring_indices[-1]
for i in range(N):
    i_next = (i + 1) % N
    new_tris.append([r_last[i_next], r_last[i], c_idx])

all_pos = np.array(new_pos, dtype=np.float32)
all_norm = np.array(new_norm, dtype=np.float32)
all_uv = np.array(new_uv, dtype=np.float32)
all_tris = np.vstack([triangles, np.array(new_tris)])
all_idx = all_tris.reshape(-1)

# Check manifoldness
ec = defaultdict(int)
for a, b, c in all_tris:
    for u, v in [(a, b), (b, c), (c, a)]:
        ec[tuple(sorted((u, v)))] += 1
hole_edges = [tuple(sorted((hole_loop[i], hole_loop[(i+1)%N]))) for i in range(N)]
unclosed = [e for e in hole_edges if ec[e] != 2]
print(f"Added {len(all_pos) - len(pos)} vertices, {len(new_tris)} triangles.")
print(f"Unclosed hole edges: {len(unclosed)} (Should be 0!)")

# Repack GLB with updated stomach primitive
# Stomach was in buffer 0. Rather than splicing in-place and shifting all subsequent accessors,
# we can append the new stomach vertex and index arrays to the end of bin_data and point Stomach accessors to them!
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

new_pos_bv = append_buffer(all_pos.tobytes(), 34962)
new_norm_bv = append_buffer(all_norm.tobytes(), 34962)
new_uv_bv = append_buffer(all_uv.tobytes(), 34962)

idx_comp_type = 5123 if len(all_pos) <= 65535 else 5125
idx_bytes = all_idx.astype(np.uint16 if idx_comp_type == 5123 else np.uint32).tobytes()
new_idx_bv = append_buffer(idx_bytes, 34963)

# Update accessors
accessors[pos_acc_idx] = {
    'bufferView': new_pos_bv,
    'componentType': 5126,
    'count': len(all_pos),
    'type': 'VEC3',
    'min': [float(x) for x in all_pos.min(axis=0)],
    'max': [float(x) for x in all_pos.max(axis=0)]
}

accessors[norm_acc_idx] = {
    'bufferView': new_norm_bv,
    'componentType': 5126,
    'count': len(all_norm),
    'type': 'VEC3',
    'min': [float(x) for x in all_norm.min(axis=0)],
    'max': [float(x) for x in all_norm.max(axis=0)]
}

accessors[uv_acc_idx] = {
    'bufferView': new_uv_bv,
    'componentType': 5126,
    'count': len(all_uv),
    'type': 'VEC2',
    'min': [float(x) for x in all_uv.min(axis=0)],
    'max': [float(x) for x in all_uv.max(axis=0)]
}

accessors[idx_acc_idx] = {
    'bufferView': new_idx_bv,
    'componentType': idx_comp_type,
    'count': len(all_idx),
    'type': 'SCALAR',
    'min': [int(all_idx.min())],
    'max': [int(all_idx.max())]
}

gltf['buffers'][0]['byteLength'] = len(bin_data)

print("Packing and saving patched DigestiveSystem.glb...")
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

print(f"Successfully saved patched {GLB_PATH} (size: {len(header) + len(chunk0) + len(chunk1):,} bytes)")
