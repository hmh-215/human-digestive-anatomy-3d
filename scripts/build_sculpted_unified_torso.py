import json
import os
import struct
import numpy as np

SCRATCH_DIR = r"C:\Users\proto\.gemini\antigravity\brain\032716ed-4938-4dcf-a8c3-035bc613e5a6\scratch"
ORIG_TORSO = os.path.join(SCRATCH_DIR, "TorsoAbdominalWall_orig.glb")
DIGESTIVE_PATH = "assets/models/DigestiveSystem.glb"
TORSO_OUT = "assets/models/TorsoAbdominalWall.glb"


def load_glb(path):
    with open(path, "rb") as f:
        magic, _, _ = struct.unpack("<III", f.read(12))
        assert magic == 0x46546C67
        jl, _ = struct.unpack("<II", f.read(8))
        g = json.loads(f.read(jl).decode("utf-8"))
        bl, _ = struct.unpack("<II", f.read(8))
        return g, f.read(bl)


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


def get_buf(g, b, idx):
    acc = g["accessors"][idx]
    bv = g["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    nc = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[acc["componentType"]]
    arr = np.frombuffer(b, dtype=dt, count=acc["count"] * nc, offset=off).copy()
    return arr.reshape(acc["count"], nc) if nc > 1 else arr


def srgb_to_linear(hex_rgb):
    r = ((hex_rgb >> 16) & 0xFF) / 255.0
    g = ((hex_rgb >> 8) & 0xFF) / 255.0
    b = (hex_rgb & 0xFF) / 255.0
    return np.array([r ** 2.2, g ** 2.2, b ** 2.2], dtype=np.float32)


def circular_interp_1d(vals, valid_mask):
    N = len(vals)
    if np.all(valid_mask):
        return vals.copy()
    if not np.any(valid_mask):
        return np.zeros(N, dtype=np.float32)
    idx_v = np.where(valid_mask)[0]
    ext_x = np.concatenate([idx_v - N, idx_v, idx_v + N]).astype(np.float64)
    ext_y = np.concatenate([vals[idx_v], vals[idx_v], vals[idx_v]]).astype(np.float64)
    return np.interp(np.arange(N, dtype=np.float64), ext_x, ext_y).astype(np.float32)


def smooth_polar_grid(R, sigma_y=1.2, sigma_t=1.6):
    Ny, Nt = R.shape
    ky_r = int(np.ceil(3 * sigma_y))
    ky = np.exp(-0.5 * (np.arange(-ky_r, ky_r + 1) / sigma_y) ** 2)
    ky /= ky.sum()
    kt_r = int(np.ceil(3 * sigma_t))
    kt = np.exp(-0.5 * (np.arange(-kt_r, kt_r + 1) / sigma_t) ** 2)
    kt /= kt.sum()

    R_t = np.zeros_like(R)
    for dt_i, w in enumerate(kt):
        R_t += w * np.roll(R, dt_i - kt_r, axis=1)

    R_out = np.zeros_like(R)
    for iy in range(Ny):
        acc = np.zeros(Nt, dtype=np.float64)
        for dy_i, w in enumerate(ky):
            jy = min(max(iy + dy_i - ky_r, 0), Ny - 1)
            acc += w * R_t[jy]
        R_out[iy] = acc
    return R_out


def recompute_vertex_normals(pos, idx):
    tris = idx.reshape(-1, 3)
    v0, v1, v2 = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    vn = np.zeros_like(pos, dtype=np.float64)
    np.add.at(vn, tris[:, 0], fn)
    np.add.at(vn, tris[:, 1], fn)
    np.add.at(vn, tris[:, 2], fn)
    norms = np.linalg.norm(vn, axis=1, keepdims=True)
    return (vn / np.maximum(norms, 1e-9)).astype(np.float32)


def build_colored_single_mesh_glb(path, pos, norms, colors, idx, node_name="Torso_Sculpted_Unified"):
    def pad4(b):
        rem = len(b) % 4
        return b + (b"\x00" * (4 - rem) if rem else b"")

    pos_b = pad4(np.ascontiguousarray(pos, dtype=np.float32).tobytes())
    nrm_b = pad4(np.ascontiguousarray(norms, dtype=np.float32).tobytes())
    col_b = pad4(np.ascontiguousarray(colors, dtype=np.float32).tobytes())
    idx_u32 = np.ascontiguousarray(idx, dtype=np.uint32)
    use_u16 = len(pos) < 65535
    idx_arr = idx_u32.astype(np.uint16) if use_u16 else idx_u32
    idx_b = pad4(idx_arr.tobytes())

    bin_blob = pos_b + nrm_b + col_b + idx_b
    off0 = 0
    off1 = len(pos_b)
    off2 = off1 + len(nrm_b)
    off3 = off2 + len(col_b)

    gltf = {
        "asset": {"version": "2.0", "generator": "Antigravity High-Res Sculpted Torso Merger v2"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": node_name, "mesh": 0}],
        "meshes": [
            {
                "name": node_name,
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2},
                        "indices": 3,
                        "mode": 4,
                    }
                ],
            }
        ],
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": off0, "byteLength": len(pos) * 12, "target": 34962},
            {"buffer": 0, "byteOffset": off1, "byteLength": len(norms) * 12, "target": 34962},
            {"buffer": 0, "byteOffset": off2, "byteLength": len(colors) * 12, "target": 34962},
            {
                "buffer": 0,
                "byteOffset": off3,
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
            {"bufferView": 1, "componentType": 5126, "count": len(norms), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(colors), "type": "VEC3"},
            {
                "bufferView": 3,
                "componentType": 5123 if use_u16 else 5125,
                "count": len(idx_arr),
                "type": "SCALAR",
            },
        ],
    }
    save_glb(path, gltf, bin_blob)


def clamp_shoulder_contour(pos):
    """
    Smoothly fold/tuck any protruding humeral/clavicular tendon tips back onto a smooth
    anatomical shoulder & collarbone contour (no triangle cutting -> zero saw-tooth 'gai'!).
    """
    p = pos.copy()
    Y_TOP = 14.24
    # Smoothly cap Y at open collarbone collar (Y <= 14.24, zero neck/jaw overlap!)
    over_y = p[:, 1] > Y_TOP
    if np.any(over_y):
        p[over_y, 1] = Y_TOP - 0.015 * np.tanh((p[over_y, 1] - Y_TOP) * 3.0)

    # Smooth lateral shoulder width curve: max half-width rx(y) tapers gently from 1.62 at Y=13.5 to 1.38 at Y=14.24
    hi = p[:, 1] > 12.90
    if np.any(hi):
        t = np.clip((p[hi, 1] - 12.90) / (Y_TOP - 12.90), 0.0, 1.0)
        rx_lim = 1.64 - 0.28 * (t * t)
        rz_lim = 1.24 - 0.30 * (t * t)
        zc_sh = -0.02 - 0.10 * t
        px = p[hi, 0]
        pz = p[hi, 2] - zc_sh
        norm_r = np.hypot(px / rx_lim, pz / rz_lim)
        out = norm_r > 1.0
        if np.any(out):
            # Smoothly compress excess protrusion instead of hard slicing
            scale = (1.0 + 0.04 * np.tanh(norm_r[out] - 1.0)) / norm_r[out]
            p_sub = p[hi]
            p_sub[out, 0] *= scale
            p_sub[out, 2] = zc_sh[out] + pz[out] * scale
            p[hi] = p_sub
    return p


def main():
    tg, tb = load_glb(ORIG_TORSO)
    dg, db = load_glb(DIGESTIVE_PATH)

    # Exclude deep stacked layers AND upper-neck/arm-girdle spike muscles (Trapezius upper parts,
    # Clavicular head of pectoralis, Teres major, Infraspinatus) so the torso ends cleanly
    # at the open collarbone rim (Y <= 14.24) with ZERO neck/jaw clipping and ZERO shoulder spikes!
    exclude_keywords = [
        "transversus_abdominis",
        "internal_abdominal_oblique",
        "iliocostalis",
        "longissimus",
        "spinalis",
        "quadratus_lumborum",
        "rhomboid",
        "levator_scapulae",
        "serratus_posterior",
        "ascending_part_of_trapezius",
        "transverse_part_of_trapezius",
        "clavicular_head_of_pectoralis_major",
        "teres_major",
        "infraspinatus",
    ]

    # Harmonized warm anatomical skin-muscle palette (no jarring gray-vs-brown clashes!)
    col_muscle = srgb_to_linear(0xD6A374)
    col_fascia_lm = srgb_to_linear(0xE8CEB3)  # Linea alba & Inguinal ligament
    col_back = srgb_to_linear(0xCE9B6E)
    col_patch = srgb_to_linear(0xCFA177)      # Seamless warm fascia liner tone

    merged_pos = []
    merged_col = []
    merged_idx = []
    vert_offset = 0
    surf_sample_pts = []

    for n in tg["nodes"]:
        if "mesh" not in n:
            continue
        nm = n["name"].lower()
        if any(k in nm for k in exclude_keywords):
            continue

        prim = tg["meshes"][n["mesh"]]["primitives"][0]
        pos_raw = get_buf(tg, tb, prim["attributes"]["POSITION"]).astype(np.float32)
        idx = get_buf(tg, tb, prim["indices"]).astype(np.uint32).flatten()

        # Smoothly fold any upper/lateral tendon tips onto the clean shoulder/collarbone contour
        pos = clamp_shoulder_contour(pos_raw)

        if "linea_alba" in nm or "ligament" in nm or "fascia" in nm:
            c = col_fascia_lm
        elif "trapezius" in nm or "latissimus" in nm:
            c = col_back
        else:
            c = col_muscle

        merged_pos.append(pos)
        merged_col.append(np.tile(c, (len(pos), 1)))
        merged_idx.append(idx + vert_offset)
        vert_offset += len(pos)

        tris = idx.reshape(-1, 3)
        surf_sample_pts.append(pos)
        surf_sample_pts.append((pos[tris[:, 0]] + pos[tris[:, 1]] + pos[tris[:, 2]]) / 3.0)

    muscle_pos = np.vstack(merged_pos)
    muscle_col = np.vstack(merged_col)
    muscle_idx = np.concatenate(merged_idx)
    surf_pts = np.vstack(surf_sample_pts)

    print(f"Preserved clean superficial trunk muscles: {len(muscle_pos)} verts, {len(muscle_idx)//3} tris")

    # Gather ALL lower abdominal & pelvic GI viscera (0.1x scale) so hips/pelvis NEVER clip colon/intestines!
    visc_names = [
        "Ascending_colon",
        "Descending_colon",
        "Transverse_colon",
        "Sigmoid_colon",
        "Vermiform_appendix",
        "Jejunum",
        "Greater_omentum",
        "Duodenum",
        "Stomach",
        "Liver",
    ]
    visc_chunks = []
    for vn in visc_names:
        node = next((x for x in dg["nodes"] if x["name"] == vn), None)
        if node:
            vp = get_buf(dg, db, dg["meshes"][node["mesh"]]["primitives"][0]["attributes"]["POSITION"]) * 0.1
            visc_chunks.append(vp)
    visc_all = np.vstack(visc_chunks)

    # Polar fascia/aponeurosis liner spanning Y = [8.45 .. 14.24] (full pelvic bowl up to open collarbone)
    pts_sym = np.vstack([surf_pts, surf_pts * np.array([-1.0, 1.0, 1.0], dtype=np.float32)])

    Ny, Nt = 104, 112
    ys = np.linspace(8.45, 14.22, Ny)
    dy = (ys[-1] - ys[0]) / (Ny - 1)
    thetas = np.linspace(0.0, 2.0 * np.pi, Nt, endpoint=False)
    dtheta = 2.0 * np.pi / Nt
    zc = np.where(ys < 13.4, 0.04, 0.04 - 0.14 * np.clip((ys - 13.4) / (14.22 - 13.4), 0.0, 1.0))

    R_patch = np.zeros((Ny, Nt), dtype=np.float32)
    R_mus_min = np.full((Ny, Nt), 99.0, dtype=np.float32)
    has_mus = np.zeros((Ny, Nt), dtype=bool)

    for iy, y in enumerate(ys):
        slab = np.abs(pts_sym[:, 1] - y) <= max(dy * 1.4, 0.13)
        s = pts_sym[slab]
        if len(s) < 12:
            continue
        ang = np.mod(np.arctan2(s[:, 2] - zc[iy], s[:, 0]), 2.0 * np.pi)
        rad = np.hypot(s[:, 0], s[:, 2] - zc[iy])
        for it, th in enumerate(thetas):
            da = np.abs(np.mod(ang - th + np.pi, 2.0 * np.pi) - np.pi)
            m = da <= dtheta * 0.95
            if np.sum(m) >= 2:
                # Track inner/recessed muscle envelope so fascia stays STRICTLY behind muscles
                r_low = float(np.percentile(rad[m], 25))
                r_high = float(np.percentile(rad[m], 85))
                R_mus_min[iy, it] = r_low
                R_patch[iy, it] = min(r_low - 0.015, r_high - 0.042)
                has_mus[iy, it] = True
        if np.any(has_mus[iy]):
            R_patch[iy] = circular_interp_1d(R_patch[iy], has_mus[iy])

    # Fill bottom pelvic slices (Y in [8.45 .. 9.08]) smoothly tapering from Y~9.15 down into pelvic floor
    valid_rows = np.where(np.any(has_mus, axis=1))[0]
    first_valid = int(valid_rows[0])
    for iy in range(first_valid):
        t = (ys[iy] - ys[0]) / max(ys[first_valid] - ys[0], 1e-4)
        # Smooth rounded pelvic cup (keeps enough room for sigmoid & descending colon)
        scale = 0.58 + 0.42 * np.sqrt(np.clip(t, 0.0, 1.0))
        R_patch[iy] = R_patch[first_valid] * scale

    R_patch = smooth_polar_grid(R_patch, sigma_y=1.4, sigma_t=1.8)

    # INVARIANT 1: Enforce strict >= +0.48 cm (0.048 raw) clearance outside ALL GI viscera (colon, jejunum, omentum)
    for iy, y in enumerate(ys):
        slab = np.abs(visc_all[:, 1] - y) <= dy * 1.6
        vs = visc_all[slab]
        if len(vs) == 0:
            continue
        ang = np.mod(np.arctan2(vs[:, 2] - zc[iy], vs[:, 0]), 2.0 * np.pi)
        rad = np.hypot(vs[:, 0], vs[:, 2] - zc[iy])
        for it, th in enumerate(thetas):
            da = np.abs(np.mod(ang - th + np.pi, 2.0 * np.pi) - np.pi)
            m = da <= dtheta * 1.15
            if np.any(m):
                floor_r = float(rad[m].max()) + 0.052  # >= 5.2 mm outside colon/jejunum/omentum!
                if R_patch[iy, it] < floor_r:
                    R_patch[iy, it] = floor_r

    R_patch = smooth_polar_grid(R_patch, sigma_y=1.1, sigma_t=1.4)

    # Re-verify hard viscera floor after smoothing (guaranteed 0 colon/hip/omentum protrusions)
    for iy, y in enumerate(ys):
        slab = np.abs(visc_all[:, 1] - y) <= dy * 1.4
        vs = visc_all[slab]
        if len(vs) == 0:
            continue
        ang = np.mod(np.arctan2(vs[:, 2] - zc[iy], vs[:, 0]), 2.0 * np.pi)
        rad = np.hypot(vs[:, 0], vs[:, 2] - zc[iy])
        for it, th in enumerate(thetas):
            da = np.abs(np.mod(ang - th + np.pi, 2.0 * np.pi) - np.pi)
            m = da <= dtheta * 1.05
            if np.any(m):
                floor_r = float(rad[m].max()) + 0.048
                if R_patch[iy, it] < floor_r:
                    R_patch[iy, it] = floor_r

    # INVARIANT 2: Ensure EVERY superficial muscle vertex stays STRICTLY OUTSIDE R_patch (+0.025 = +2.5 mm)
    # whenever it covers the fascia liner, so fascia NEVER pokes through Pectoralis/Abs/Obliques at 100% opacity
    # AND muscles expand harmoniously with the hip/pelvis over Ascending/Descending colon!
    nudged_mus = 0
    for vi in range(len(muscle_pos)):
        vx, vy, vz = muscle_pos[vi]
        fy = np.clip((vy - ys[0]) / dy, 0.0, Ny - 1.0001)
        iy0 = int(np.floor(fy))
        ay = fy - iy0
        zc_v = (1.0 - ay) * zc[iy0] + ay * zc[iy0 + 1]
        dx = vx
        dz = vz - zc_v
        r_v = float(np.hypot(dx, dz))
        if r_v < 1e-5:
            continue
        ang = float(np.mod(np.arctan2(dz, dx), 2.0 * np.pi))
        ft = (ang / dtheta) % Nt
        it0 = int(np.floor(ft)) % Nt
        it1 = (it0 + 1) % Nt
        at = ft - np.floor(ft)
        r_f = (
            (1.0 - ay) * ((1.0 - at) * R_patch[iy0, it0] + at * R_patch[iy0, it1])
            + ay * ((1.0 - at) * R_patch[iy0 + 1, it0] + at * R_patch[iy0 + 1, it1])
        )
        # Keep muscle outer surface cleanly proud of fascia liner by at least +0.025 (2.5 mm)
        min_mus_r = r_f + 0.025
        if r_v < min_mus_r:
            scale = min_mus_r / r_v
            muscle_pos[vi, 0] = dx * scale
            muscle_pos[vi, 2] = zc_v + dz * scale
            nudged_mus += 1

    print(f"Adjusted {nudged_mus}/{len(muscle_pos)} muscle verts cleanly outside fascia/colon envelope.")

    # Build OPEN-TOP (collarbone aperture Y=14.22) & CLOSED-BOTTOM (pelvic floor cap Y=8.32) fascia liner
    cos_t, sin_t = np.cos(thetas), np.sin(thetas)
    grid_v = np.zeros((Ny, Nt, 3), dtype=np.float32)
    for iy in range(Ny):
        grid_v[iy, :, 0] = R_patch[iy] * cos_t
        grid_v[iy, :, 1] = ys[iy]
        grid_v[iy, :, 2] = zc[iy] + R_patch[iy] * sin_t

    cand_tris = []
    for iy in range(Ny - 1):
        for it in range(Nt):
            it_n = (it + 1) % Nt
            v00 = iy * Nt + it
            v01 = iy * Nt + it_n
            v10 = (iy + 1) * Nt + it
            v11 = (iy + 1) * Nt + it_n
            cand_tris.append([v00, v10, v11])
            cand_tris.append([v00, v11, v01])

    flat_grid_v = grid_v.reshape(-1, 3)
    bot_c = np.array([[0.0, ys[0] - 0.12, zc[0]]], dtype=np.float32)
    patch_pos = np.vstack([flat_grid_v, bot_c])
    bot_i = len(flat_grid_v)
    cap_tris = [[bot_i, it, (it + 1) % Nt] for it in range(Nt)]
    patch_tris = np.vstack([np.array(cand_tris, dtype=np.uint32), np.array(cap_tris, dtype=np.uint32)])
    patch_idx = patch_tris.flatten().astype(np.uint32)
    patch_col = np.tile(col_patch, (len(patch_pos), 1))

    # Recompute clean normals for BOTH muscles and fascia liner
    muscle_nrm = recompute_vertex_normals(muscle_pos, muscle_idx)
    patch_nrm = recompute_vertex_normals(patch_pos, patch_idx)

    # Combine into 1 SINGLE UNIFIED MESH
    all_pos = np.vstack([muscle_pos, patch_pos]).astype(np.float32)
    all_nrm = np.vstack([muscle_nrm, patch_nrm]).astype(np.float32)
    all_col = np.vstack([muscle_col, patch_col]).astype(np.float32)
    all_idx = np.concatenate([muscle_idx, patch_idx + len(muscle_pos)]).astype(np.uint32)

    build_colored_single_mesh_glb(
        TORSO_OUT, all_pos, all_nrm, all_col, all_idx, node_name="Torso_Sculpted_Unified"
    )
    print(f"Saved {TORSO_OUT}: 1 node, {len(all_pos)} verts, {len(all_idx)//3} tris")

    # Strict post-build audit against ALL GI viscera (colon, jejunum, omentum, stomach, liver)
    print("\n=== POST-BUILD VISCERA VS TORSO HIP/PELVIS CLEARANCE AUDIT ===")
    for vn in visc_names:
        node = next((x for x in dg["nodes"] if x["name"] == vn), None)
        if not node:
            continue
        op = get_buf(dg, db, dg["meshes"][node["mesh"]]["primitives"][0]["attributes"]["POSITION"]) * 0.1
        worst = -999.0
        out_cnt = 0
        for pt in op:
            fy = np.clip((pt[1] - ys[0]) / dy, 0.0, Ny - 1.0001)
            iy0 = int(np.floor(fy))
            ay = fy - iy0
            zc_v = (1.0 - ay) * zc[iy0] + ay * zc[iy0 + 1]
            r_v = float(np.hypot(pt[0], pt[2] - zc_v))
            ang = float(np.mod(np.arctan2(pt[2] - zc_v, pt[0]), 2.0 * np.pi))
            ft = (ang / dtheta) % Nt
            it0 = int(np.floor(ft)) % Nt
            it1 = (it0 + 1) % Nt
            at = ft - np.floor(ft)
            r_f = (
                (1.0 - ay) * ((1.0 - at) * R_patch[iy0, it0] + at * R_patch[iy0, it1])
                + ay * ((1.0 - at) * R_patch[iy0 + 1, it0] + at * R_patch[iy0 + 1, it1])
            )
            ex = (r_v - r_f) * 10.0
            if ex > worst:
                worst = ex
            if ex > -0.10:
                out_cnt += 1
        print(f"  {vn:22s} | worst_excess={worst:+6.3f} cm | protruding={out_cnt}/{len(op)}")


if __name__ == "__main__":
    main()
