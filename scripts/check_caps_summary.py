import struct
import json

with open('assets/models/UpperDigestiveTract.glb', 'rb') as f:
    f.seek(12)
    jl, _ = struct.unpack('<II', f.read(8))
    g = json.loads(f.read(jl))

caps = [n for n in g['nodes'] if 'Cap' in n['name']]
print(f"Total caps found: {len(caps)}")
for c in caps:
    m = g['meshes'][c['mesh']]
    p = m['primitives'][0]
    pos_acc = g['accessors'][p['attributes']['POSITION']]
    idx_acc = g['accessors'][p['indices']]
    print(f"  * {c['name']:16s}: {pos_acc['count']:3d} verts, {idx_acc['count']//3:3d} tris | Y in [{pos_acc['min'][1]:.2f}, {pos_acc['max'][1]:.2f}] | Z in [{pos_acc['min'][2]:.2f}, {pos_acc['max'][2]:.2f}]")
