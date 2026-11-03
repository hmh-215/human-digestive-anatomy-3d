import json, struct
import numpy as np
from collections import defaultdict
import heapq

with open('assets/models/DigestiveSystem.glb', 'rb') as f:
    f.read(12)
    c0_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    gltf = json.loads(f.read(c0_len).decode('utf-8'))
    c1_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    bin_data = f.read(c1_len)

def get_buffer(acc_idx):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    count = acc['count']
    comp_type = acc['componentType']
    type_ = acc['type']
    return offset, count, comp_type, type_

for n in gltf['nodes']:
    if n.get('name') == 'Jejunum':
        midx = n['mesh']
        prim = gltf['meshes'][midx]['primitives'][0]
        pos_off, pos_count, _, _ = get_buffer(prim['attributes']['POSITION'])
        si_pts = np.frombuffer(bin_data, dtype=np.float32, count=pos_count*3, offset=pos_off).reshape(-1, 3)
        ind_off, ind_count, ind_comp, _ = get_buffer(prim['indices'])
        dtype = np.uint16 if ind_comp == 5123 else np.uint32
        indices = np.frombuffer(bin_data, dtype=dtype, count=ind_count, offset=ind_off).reshape(-1, 3)
        break

start_v = 13831
end_v = 572

adj = defaultdict(list)
for tri in indices:
    u, v, w = tri
    for a, b in [(u, v), (v, w), (w, u)]:
        d = np.linalg.norm(si_pts[a] - si_pts[b])
        adj[a].append((b, d))
        adj[b].append((a, d))

dist = np.zeros(len(si_pts), dtype=np.float32)
dist.fill(1e9)
dist[start_v] = 0.0
pq = [(0.0, start_v)]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]: continue
    for v, weight in adj[u]:
        new_d = d + weight
        if new_d < dist[v]:
            dist[v] = new_d
            heapq.heappush(pq, (new_d, v))

norm_d = (dist / dist.max()).astype(np.float32)

# Save precalculated normalized tube progress array to data/si_tube_progress.bin
out_path = 'data/si_tube_progress.bin'
with open(out_path, 'wb') as f:
    f.write(norm_d.tobytes())

print(f"Saved {len(norm_d)} float32 values to {out_path} ({len(norm_d)*4} bytes)")

# Also save JSON format just in case
json_path = 'data/si_tube_progress.json'
with open(json_path, 'w') as f:
    # Round to 4 decimal places for compact JSON
    json.dump([round(float(x), 4) for x in norm_d], f)

print(f"Saved JSON to {json_path}")
