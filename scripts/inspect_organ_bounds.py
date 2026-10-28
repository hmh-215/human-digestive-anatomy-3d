import json

with open('assets/models/DigestiveSystem.glb', 'rb') as f:
    f.seek(12)
    chunk0_len = int.from_bytes(f.read(4), 'little')
    f.seek(20)
    gltf = json.loads(f.read(chunk0_len).decode('utf-8'))

for m in gltf['meshes']:
    name = m.get('name', '')
    p = m['primitives'][0]
    pos_acc = gltf['accessors'][p['attributes']['POSITION']]
    c = pos_acc['count']
    mn = [round(v, 2) for v in pos_acc['min']]
    mx = [round(v, 2) for v in pos_acc['max']]
    print(f"{name:35s} count={c:5d}  X:[{mn[0]:6.2f}, {mx[0]:6.2f}]  Y:[{mn[1]:6.2f}, {mx[1]:6.2f}]  Z:[{mn[2]:6.2f}, {mx[2]:6.2f}]")
