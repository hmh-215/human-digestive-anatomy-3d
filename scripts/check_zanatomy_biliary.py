with open('assets/models/VisceralSystem.fbx', 'rb') as f:
    buf = f.read()

import re

# Look for patterns like Name\x00\x01...
# In FBX binary, node names often appear before "Model" or "Geometry"
for pattern in [b'Gallbladder', b'Bile', b'Duct', b'duct', b'Extrahepatic']:
    pos = 0
    while True:
        idx = buf.find(pattern, pos)
        if idx == -1:
            break
        start = max(0, idx - 40)
        end = min(len(buf), idx + 60)
        snippet = buf[start:end]
        # Clean non-printable
        cleaned = ''.join(chr(b) if 32 <= b <= 126 else f'\\x{b:02x}' for b in snippet)
        print(f"Found '{pattern.decode()}' at {idx}: {cleaned}")
        pos = idx + len(pattern)
