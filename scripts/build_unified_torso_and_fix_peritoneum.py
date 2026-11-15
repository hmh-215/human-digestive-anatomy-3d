import json
import os
import shutil
import struct
import numpy as np

SCRATCH_DIR = r"C:\Users\proto\.gemini\antigravity\brain\032716ed-4938-4dcf-a8c3-035bc613e5a6\scratch"
BACKUP_TORSO = os.path.join(SCRATCH_DIR, "TorsoAbdominalWall_orig.glb")
BACKUP_DIGESTIVE = os.path.join(SCRATCH_DIR, "DigestiveSystem_orig.glb")
TORSO_PATH = "assets/models/TorsoAbdominalWall.glb"
DIGESTIVE_PATH = "assets/models/DigestiveSystem.glb"


def load_glb(path):
    with open(path, "rb") as f:
        magic, version, length = struct.unpack("<III", f.read(12))
        assert magic == 0x46546C67
        jl, _ = struct.unpack("<II", f.read(8))
        gltf = json.loads(f.read(jl).decode("utf-8"))
        bl, _ = struct.unpack("<II", f.read(8))
        bin_data = f.read(bl)
    return gltf, bytearray(bin_data)


def save_glb(path, gltf, bin_data):
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "
    bin_bytes = bytes(bin_data)
    while len(bin_bytes) % 4 != 0:
        bin_bytes += b"\x00"
    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
        f.write(bin_bytes)


def get_buf(gltf, bin_data, acc_idx):
    acc = gltf["accessors"][acc_idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    nc = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[acc["componentType"]]
    arr = np.frombuffer(bin_data, dtype=dt, count=acc["count"] * nc, offset=off).copy()
    return arr.reshape(acc["count"], nc) if nc > 1 else arr


def set_buf_vec3(gltf, bin_data, acc_idx, arr_f32):
    acc = gltf["accessors"][acc_idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    arr_c = np.ascontiguousarray(arr_f32, dtype=np.float32)
    raw = arr_c.tobytes()
    bin_data[off : off + len(raw)] = raw
    acc["min"] = [float(x) for x in arr_c.min(axis=0)]
    acc["max"] = [float(x) for x in arr_c.max(axis=0)]


def recompute_vertex_normals(pos, idx):
    tris = idx.reshape(-1, 3)
    v0 = pos[tris[:, 0]]
    v1 = pos[tris[:, 1]]
    v2 = pos[tris[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    vn = np.zeros_like(pos, dtype=np.float64)
    np.add.at(vn, tris[:, 0], fn)
    np.add.at(vn, tris[:, 1], fn)
    np.add.at(vn, tris[:, 2], fn)
    norms = np.linalg.norm(vn, axis=1, keepdims=True)
    return (vn / np.maximum(norms, 1e-9)).astype(np.float32)


def circular_interp_1d(vals, valid_mask):
    N = len(vals)
    if np.all(valid_mask):
        return vals.copy()
    if not np.any(valid_mask):
        return np.zeros(N, dtype=np.float32)
    idx_v = np.where(valid_mask)[0]
    # Periodic extension over [-N, 2N)
    ext_x = np.concatenate([idx_v - N, idx_v, idx_v + N]).astype(np.float64)
    ext_y = np.concatenate([vals[idx_v], vals[idx_v], vals[idx_v]]).astype(np.float64)
    all_x = np.arange(N, dtype=np.float64)
    return np.interp(all_x, ext_x, ext_y).astype(np.float32)


def smooth_polar_grid(R, zc, sigma_y=1.3, sigma_t=1.8):
    # Separable Gaussian smoothing: circular in theta, clamped edge in y
    Ny, Nt = R.shape
    ky_r = int(np.ceil(3 * sigma_y))
    ky = np.exp(-0.5 * (np.arange(-ky_r, ky_r + 1) / sigma_y) ** 2)
    ky /= ky.sum()

    kt_r = int(np.ceil(3 * sigma_t))
    kt = np.exp(-0.5 * (np.arange(-kt_r, kt_r + 1) / sigma_t) ** 2)
    kt /= kt.sum()

    # Smooth along theta circularly
    R_t = np.zeros_like(R)
    for dt_i, w in enumerate(kt):
        shift = dt_i - kt_r
        R_t += w * np.roll(R, shift, axis=1)

    # Smooth along Y (keep bottom/top edge well-behaved)
    R_out = np.zeros_like(R)
    for iy in range(Ny):
        acc = np.zeros(Nt, dtype=np.float64)
        wsum = 0.0
        for dy_i, w in enumerate(ky):
            jy = min(max(iy + dy_i - ky_r, 0), Ny - 1)
            acc += w * R_t[jy]
            wsum += w
        R_out[iy] = acc / wsum
    return R_out


def build_single_mesh_glb(path, pos, norms, idx, node_name="Torso_Skin_Envelope"):
    pos_b = np.ascontiguousarray(pos, dtype=np.float32).tobytes()
    nrm_b = np.ascontiguousarray(norms, dtype=np.float32).tobytes()
    idx_u32 = np.ascontiguousarray(idx, dtype=np.uint32)
    use_u16 = len(pos) < 65535
    idx_arr = idx_u32.astype(np.uint16) if use_u16 else idx_u32
    idx_b = idx_arr.tobytes()

    def pad4(b):
        rem = len(b) % 4
        return b + (b"\x00" * (4 - rem) if rem else b"")

    pos_b = pad4(pos_b)
    nrm_b = pad4(nrm_b)
    idx_b = pad4(idx_b)
    bin_blob = pos_b + nrm_b + idx_b

    off0 = 0
    off1 = len(pos_b)
    off2 = off1 + len(nrm_b)

    gltf = {
        "asset": {"version": "2.0", "generator": "Antigravity Torso Envelope Synthesizer"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": node_name, "mesh": 0}],
        "meshes": [
            {
                "name": node_name,
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1},
                        "indices": 2,
                        "mode": 4,
                    }
                ],
            }
        ],
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": off0, "byteLength": len(pos) * 12, "target": 34962},
            {"buffer": 0, "byteOffset": off1, "byteLength": len(norms) * 12, "target": 34962},
            {
                "buffer": 0,
                "byteOffset": off2,
                "byteLength": len(idx_arr) * (2 if use_u16 else 4),
                "target": 34963,
            },
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(pos),
                "type": "VEC3",
                "min": [float(x) for x in pos.min(axis=0)],
                "max": [float(x) for x in pos.max(axis=0)],
            },
            {
                "bufferView": 1,
                "componentType": 5126,
                "count": len(norms),
                "type": "VEC3",
            },
            {
                "bufferView": 2,
                "componentType": 5123 if use_u16 else 5125,
                "count": len(idx_arr),
                "type": "SCALAR",
            },
        ],
    }
    save_glb(path, gltf, bin_blob)


def main():
    os.makedirs(SCRATCH_DIR, exist_ok=True)
    if not os.path.exists(BACKUP_TORSO):
        shutil.copy2(TORSO_PATH, BACKUP_TORSO)
    if not os.path.exists(BACKUP_DIGESTIVE):
        shutil.copy2(DIGESTIVE_PATH, BACKUP_DIGESTIVE)

    tg, tb = load_glb(BACKUP_TORSO)
    dg, db = load_glb(BACKUP_DIGESTIVE)

    # 1. Sample dense surface points from all 55 muscle meshes (verts + tri centroids + edge mids)
    sample_chunks = []
    for n in tg["nodes"]:
        if "mesh" not in n:
            continue
        for p in tg["meshes"][n["mesh"]]["primitives"]:
            pos = get_buf(tg, tb, p["attributes"]["POSITION"])
            sample_chunks.append(pos)
            if "indices" in p:
                idx = get_buf(tg, tb, p["indices"]).reshape(-1, 3)
                v0, v1, v2 = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
                sample_chunks.append((v0 + v1 + v2) / 3.0)
                sample_chunks.append(0.5 * (v0 + v1))
                sample_chunks.append(0.5 * (v1 + v2))
                sample_chunks.append(0.5 * (v2 + v0))
    pts_raw = np.vstack(sample_chunks)

    # Trim stray detached shoulder/arm tendon wing tips jutting past natural shoulder width
    # At Y > 13.5, muscles like deltoid/teres flare out horizontally past |X|=1.72; gently clip outliers
    keep_mask = np.ones(len(pts_raw), dtype=bool)
    keep_mask &= ~((pts_raw[:, 1] > 14.35) & (np.abs(pts_raw[:, 0]) > 1.72))
    keep_mask &= ~((pts_raw[:, 1] > 14.70) & (np.abs(pts_raw[:, 0]) > 1.45))
    keep_mask &= ~((pts_raw[:, 1] > 15.05) & (np.abs(pts_raw[:, 0]) > 0.72))
    pts_raw = pts_raw[keep_mask]

    # Symmetrize across X=0 so torso silhouette is bilaterally balanced & smooth
    pts_mir = pts_raw.copy()
    pts_mir[:, 0] = -pts_mir[:, 0]
    pts_sym = np.vstack([pts_raw, pts_mir])

    # 2. Gather internal viscera sample points scaled by 0.1 (for strict containment floor)
    viscera_names = [
        "Liver",
        "Stomach",
        "Duodenum",
        "Jejunum",
        "Ascending_colon",
        "Transverse_colon",
        "Descending_colon",
        "Sigmoid_colon",
        "Oesophagus",
        "Mesocolon",
        "Lesser_omentum",
    ]
    visc_pts = []
    for vname in viscera_names:
        node = next((x for x in dg["nodes"] if x["name"] == vname), None)
        if node:
            pos = get_buf(dg, db, dg["meshes"][node["mesh"]]["primitives"][0]["attributes"]["POSITION"])
            visc_pts.append(pos * 0.1)
    visc_all = np.vstack(visc_pts)

    # Also extract Greater_omentum separately (10x scene coords -> * 0.1 for raw torso coords)
    om_node = next(x for x in dg["nodes"] if x["name"] == "Greater_omentum")
    om_prim = dg["meshes"][om_node["mesh"]]["primitives"][0]
    om_pos_acc = om_prim["attributes"]["POSITION"]
    om_nrm_acc = om_prim["attributes"]["NORMAL"]
    om_idx = get_buf(dg, db, om_prim["indices"])
    om_pos = get_buf(dg, db, om_pos_acc)

    # 3. Polar heightfield parameters: 84 slices in Y [9.05 .. 15.75], 88 angular bins
    Ny = 84
    Nt = 88
    ys = np.linspace(9.05, 15.75, Ny)
    dy = (ys[-1] - ys[0]) / (Ny - 1)
    thetas = np.linspace(0.0, 2.0 * np.pi, Nt, endpoint=False)
    dtheta = 2.0 * np.pi / Nt

    # Smooth centerline Z_c(y) from abdomen (+0.08) smoothly shifting to neck (-0.24)
    zc = np.where(
        ys < 13.8,
        0.06,
        0.06 - 0.30 * np.clip((ys - 13.8) / (15.35 - 13.8), 0.0, 1.0),
    )

    R_mus = np.zeros((Ny, Nt), dtype=np.float32)
    valid = np.zeros((Ny, Nt), dtype=bool)

    for iy, y in enumerate(ys):
        # Smooth anatomical neck cap above Y=15.05 (anterior neck bridge + cylinder)
        if y >= 15.12:
            # Clean ergonomic neck cross-section centered at (0, zc[iy])
            t_neck = np.clip((y - 15.12) / (15.75 - 15.12), 0.0, 1.0)
            rx = 0.54 - 0.06 * t_neck
            rz = 0.48 - 0.04 * t_neck
            R_mus[iy] = (rx * rz) / np.sqrt((rz * np.cos(thetas)) ** 2 + (rx * np.sin(thetas)) ** 2)
            valid[iy] = True
            continue

        slab = np.abs(pts_sym[:, 1] - y) <= max(dy * 1.15, 0.11)
        s = pts_sym[slab]
        if len(s) < 20:
            continue
        dx = s[:, 0]
        dz = s[:, 2] - zc[iy]
        ang = np.mod(np.arctan2(dz, dx), 2.0 * np.pi)
        rad = np.hypot(dx, dz)

        for it, th in enumerate(thetas):
            # Angular distance wrapped around 2*pi
            da = np.abs(np.mod(ang - th + np.pi, 2.0 * np.pi) - np.pi)
            m = da <= dtheta * 0.85
            if np.sum(m) >= 3:
                # 94th percentile suppresses single stray spikes while matching outer muscle contour
                R_mus[iy, it] = float(np.percentile(rad[m], 94))
                valid[iy, it] = True

        # Bridge any muscular holes (sternal cleft, costal gap, linea alba gap) cleanly
        if np.any(valid[iy]):
            R_mus[iy] = circular_interp_1d(R_mus[iy], valid[iy])
            valid[iy] = True

    # Handle upper clavicle / shoulder-to-neck blend cleanly (Y in [14.40 .. 15.15])
    # First smooth raw muscle grid lightly so sternal bridge has clean slope
    R_mus = smooth_polar_grid(R_mus, zc, sigma_y=1.1, sigma_t=1.6)

    # Blend chest/shoulders cleanly into base of neck between Y=14.45 and Y=15.12
    for iy, y in enumerate(ys):
        if 14.45 <= y < 15.12:
            t = (y - 14.45) / (15.12 - 14.45)
            # Smoothstep ease-in-out
            s_t = t * t * (3.0 - 2.0 * t)
            rx = 0.56
            rz = 0.50
            r_neck = (rx * rz) / np.sqrt((rz * np.cos(thetas)) ** 2 + (rx * np.sin(thetas)) ** 2)
            # Take smooth transition and preserve anterior chest envelope above sternal notch
            R_mus[iy] = (1.0 - s_t) * R_mus[iy] + s_t * r_neck

    # Add uniform subcutaneous skin layer (+0.036 raw = 0.36 cm anterior/lateral, +0.025 posterior)
    sin_t = np.sin(thetas)
    skin_offset = 0.028 + 0.012 * np.maximum(0.0, sin_t)  # extra smooth pad anteriorly
    R_skin = R_mus + skin_offset[None, :]

    # Re-smooth after skin thickness addition
    R_skin = smooth_polar_grid(R_skin, zc, sigma_y=1.4, sigma_t=1.8)

    # 4. Enforce internal viscera clearance floor (excluding Greater_omentum first, we handle it next)
    for iy, y in enumerate(ys):
        slab = np.abs(visc_all[:, 1] - y) <= dy * 1.4
        vs = visc_all[slab]
        if len(vs) == 0:
            continue
        ang = np.mod(np.arctan2(vs[:, 2] - zc[iy], vs[:, 0]), 2.0 * np.pi)
        rad = np.hypot(vs[:, 0], vs[:, 2] - zc[iy])
        for it, th in enumerate(thetas):
            da = np.abs(np.mod(ang - th + np.pi, 2.0 * np.pi) - np.pi)
            m = da <= dtheta * 1.0
            if np.any(m):
                floor_r = float(rad[m].max()) + 0.055  # >= 0.55 cm at 10x scale
                if R_skin[iy, it] < floor_r:
                    R_skin[iy, it] = floor_r

    R_skin = smooth_polar_grid(R_skin, zc, sigma_y=1.0, sigma_t=1.3)

    # 5. Fix Greater_omentum clipping! Gently tuck any Greater_omentum vertices that poke outside
    #    (R_skin - 0.048) in raw units (= 4.8 mm inside skin wall), and clip low needle spikes below Y=89.5
    om_raw = om_pos * 0.1
    om_tucked = 0
    for vi in range(len(om_raw)):
        vx, vy, vz = om_raw[vi]
        # Lift extreme needle tips at the very bottom apron gently up to >= 8.95
        if vy < 8.95:
            vy = 8.95 + (vy - 8.80) * 0.25
        fy = np.clip((vy - ys[0]) / dy, 0.0, Ny - 1.0001)
        iy0 = int(np.floor(fy))
        ay = fy - iy0
        zc_v = (1.0 - ay) * zc[iy0] + ay * zc[iy0 + 1]

        dx = vx
        dz = vz - zc_v
        r_v = float(np.hypot(dx, dz))
        ang = float(np.mod(np.arctan2(dz, dx), 2.0 * np.pi))
        ft = (ang / dtheta) % Nt
        it0 = int(np.floor(ft)) % Nt
        it1 = (it0 + 1) % Nt
        at = ft - np.floor(ft)

        r_limit = (
            (1.0 - ay) * ((1.0 - at) * R_skin[iy0, it0] + at * R_skin[iy0, it1])
            + ay * ((1.0 - at) * R_skin[iy0 + 1, it0] + at * R_skin[iy0 + 1, it1])
        ) - 0.048  # 4.8 mm inward clearance from skin envelope

        if r_v > r_limit and r_v > 1e-6:
            scale = r_limit / r_v
            om_raw[vi, 0] = dx * scale
            om_raw[vi, 1] = vy
            om_raw[vi, 2] = zc_v + dz * scale
            om_tucked += 1
        else:
            om_raw[vi, 1] = vy

    om_new_pos = (om_raw * 10.0).astype(np.float32)
    om_new_nrm = recompute_vertex_normals(om_new_pos, om_idx)
    set_buf_vec3(dg, db, om_pos_acc, om_new_pos)
    set_buf_vec3(dg, db, om_nrm_acc, om_new_nrm)
    save_glb(DIGESTIVE_PATH, dg, db)
    print(f"Tucked {om_tucked}/{len(om_pos)} Greater_omentum vertices inside torso clearance (>=4.8 mm).")

    # 6. Build clean watertight closed torso mesh (bottom pelvic cap + body rings + top neck cap)
    # Add 3 smooth bottom closing rings (from Y=9.05 curving gently inward to Y=8.74)
    # and 2 smooth top closing bevel rings on neck (Y=15.75 -> Y=15.86)
    rings_y = []
    rings_r = []
    rings_zc = []

    # Bottom dome (3 tapering rings)
    r_bot = R_skin[0]
    zc_bot = zc[0]
    for k, (dy_off, r_scale) in enumerate([(-0.10, 0.86), (-0.21, 0.62), (-0.29, 0.30)]):
        rings_y.append(ys[0] + dy_off)
        rings_r.append(r_bot * r_scale)
        rings_zc.append(zc_bot)

    rings_y.reverse()
    rings_r.reverse()
    rings_zc.reverse()

    for iy in range(Ny):
        rings_y.append(float(ys[iy]))
        rings_r.append(R_skin[iy])
        rings_zc.append(float(zc[iy]))

    # Top neck bevel rings
    r_top = R_skin[-1]
    zc_top = zc[-1]
    for dy_off, r_scale in [(0.05, 0.86), (0.09, 0.55)]:
        rings_y.append(ys[-1] + dy_off)
        rings_r.append(r_top * r_scale)
        rings_zc.append(zc_top)

    M_rings = len(rings_y)
    verts = []
    # Vertex 0 = bottom apex
    verts.append([0.0, rings_y[0] - 0.04, zc_bot])
    # Ring vertices: index = 1 + ir * Nt + it
    cos_t = np.cos(thetas)
    sin_t = np.sin(thetas)
    for ir in range(M_rings):
        y_val = rings_y[ir]
        r_arr = rings_r[ir]
        zc_val = rings_zc[ir]
        for it in range(Nt):
            verts.append([float(r_arr[it] * cos_t[it]), y_val, float(zc_val + r_arr[it] * sin_t[it])])
    # Last vertex = top neck cap center
    top_cap_idx = len(verts)
    verts.append([0.0, rings_y[-1] + 0.02, zc_top])

    verts = np.array(verts, dtype=np.float32)

    # Triangle indices (outward winding verified: (0,1,0) x (-sin,0,cos) = (+cos,0,+sin))
    tris = []
    # Bottom fan around vertex 0 (ring 0 is below cap y, looking up from -Y outward)
    for it in range(Nt):
        it_next = (it + 1) % Nt
        v1 = 1 + it
        v2 = 1 + it_next
        tris.append([0, v1, v2])

    # Side quads between consecutive rings
    for ir in range(M_rings - 1):
        b0 = 1 + ir * Nt
        b1 = 1 + (ir + 1) * Nt
        for it in range(Nt):
            it_next = (it + 1) % Nt
            a = b0 + it
            b = b0 + it_next
            c = b1 + it
            d = b1 + it_next
            tris.append([a, c, d])
            tris.append([a, d, b])

    # Top fan around top_cap_idx
    top_ring_base = 1 + (M_rings - 1) * Nt
    for it in range(Nt):
        it_next = (it + 1) % Nt
        v1 = top_ring_base + it
        v2 = top_ring_base + it_next
        tris.append([v1, top_cap_idx, v2])

    tris = np.array(tris, dtype=np.uint32).flatten()
    norms = recompute_vertex_normals(verts, tris)

    # Verify outward normals average positive dot with radial vectors
    test_v = verts[1 : 1 + M_rings * Nt]
    test_n = norms[1 : 1 + M_rings * Nt]
    dot_chk = float(np.mean(test_v[:, 0] * test_n[:, 0] + test_v[:, 2] * test_n[:, 2]))
    assert dot_chk > 0.2, f"Normal orientation unexpected: {dot_chk}"

    build_single_mesh_glb(TORSO_PATH, verts, norms, tris, node_name="Torso_Skin_Envelope")
    print(
        f"Saved unified watertight {TORSO_PATH}: 1 node, {len(verts)} verts, {len(tris)//3} tris "
        f"(outward normal check={dot_chk:.3f})."
    )

    # 7. Audit zero clipping for Greater_omentum & Liver & round_ligament reference bounds
    om_check = om_new_pos * 0.1
    max_excess = -999.0
    protruding = 0
    for vi in range(len(om_check)):
        vx, vy, vz = om_check[vi]
        fy = np.clip((vy - ys[0]) / dy, 0.0, Ny - 1.0001)
        iy0 = int(np.floor(fy))
        ay = fy - iy0
        zc_v = (1.0 - ay) * zc[iy0] + ay * zc[iy0 + 1]
        r_v = float(np.hypot(vx, vz - zc_v))
        ang = float(np.mod(np.arctan2(vz - zc_v, vx), 2.0 * np.pi))
        ft = (ang / dtheta) % Nt
        it0 = int(np.floor(ft)) % Nt
        it1 = (it0 + 1) % Nt
        at = ft - np.floor(ft)
        r_skin_here = (
            (1.0 - ay) * ((1.0 - at) * R_skin[iy0, it0] + at * R_skin[iy0, it1])
            + ay * ((1.0 - at) * R_skin[iy0 + 1, it0] + at * R_skin[iy0 + 1, it1])
        )
        excess = (r_v - r_skin_here) * 10.0  # cm
        if excess > max_excess:
            max_excess = excess
        if excess > -0.1:
            protruding += 1
    print(f"Post-build Greater_omentum vs Torso clearance: worst_excess={max_excess:.3f} cm, protruding={protruding}")


if __name__ == "__main__":
    main()
