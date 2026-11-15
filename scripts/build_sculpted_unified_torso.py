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
        "asset": {"version": "2.0", "generator": "Antigravity High-Res Sculpted Torso Merger"},
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


def main():
    tg, tb = load_glb(ORIG_TORSO)
    dg, db = load_glb(DIGESTIVE_PATH)

    # Keep ALL superficial anatomical reliefs (abs, obliques, pectorals, serratus, linea alba, inguinal, latissimus, trapezius)
    # Exclude deep hidden posterior/inner stack layers that cause muddy triple-alpha blotches and detached scapular wings
    deep_keywords = [
        "transversus_abdominis",
        "internal_abdominal_oblique",
        "iliocostalis",
        "longissimus",
        "spinalis",
        "quadratus_lumborum",
        "rhomboid",
        "levator_scapulae",
        "serratus_posterior",
    ]

    col_muscle = srgb_to_linear(0xD49D6A)
    col_fascia = srgb_to_linear(0xEAD8C4)
    col_back = srgb_to_linear(0xC99669)
    col_patch = srgb_to_linear(0xDFC4AA)

    merged_pos = []
    merged_nrm = []
    merged_col = []
    merged_idx = []
    vert_offset = 0

    surf_sample_pts = []

    for n in tg["nodes"]:
        if "mesh" not in n:
            continue
        nm = n["name"].lower()
        if any(k in nm for k in deep_keywords):
            continue

        prim = tg["meshes"][n["mesh"]]["primitives"][0]
        pos = get_buf(tg, tb, prim["attributes"]["POSITION"]).astype(np.float32)
        nrm = get_buf(tg, tb, prim["attributes"]["NORMAL"]).astype(np.float32)
        idx = get_buf(tg, tb, prim["indices"]).astype(np.uint32).flatten()

        # Trim stray floating deltoid/clavicle lateral tendon horn tips at top shoulders
        tris = idx.reshape(-1, 3)
        tri_pts = pos[tris]  # (T, 3, 3)
        max_y = tri_pts[:, :, 1].max(axis=1)
        max_abs_x = np.abs(tri_pts[:, :, 0]).max(axis=1)
        drop_horns = (
            ((max_y > 14.42) & (max_abs_x > 1.22))
            | ((max_y > 14.12) & (max_abs_x > 1.46))
            | ((max_y > 13.70) & (max_abs_x > 1.66))
        )
        if np.any(drop_horns):
            tris = tris[~drop_horns]
            idx = tris.flatten()

        if "linea_alba" in nm or "ligament" in nm or "fascia" in nm:
            c = col_fascia
        elif "trapezius" in nm or "latissimus" in nm or "infraspinatus" in nm or "teres" in nm:
            c = col_back
        else:
            c = col_muscle

        merged_pos.append(pos)
        merged_nrm.append(nrm)
        merged_col.append(np.tile(c, (len(pos), 1)))
        merged_idx.append(idx + vert_offset)
        vert_offset += len(pos)

        surf_sample_pts.append((pos[tris[:, 0]] + pos[tris[:, 1]] + pos[tris[:, 2]]) / 3.0)

    muscle_pos = np.vstack(merged_pos)
    muscle_nrm = np.vstack(merged_nrm)
    muscle_col = np.vstack(merged_col)
    muscle_idx = np.concatenate(merged_idx)
    surf_pts = np.vstack(surf_sample_pts)

    print(f"Preserved original superficial meshes: {len(muscle_pos)} verts, {len(muscle_idx)//3} tris")

    # Build targeted high-resolution Fascia/Aponeurosis Patch ONLY for open gaps
    # (sternal midline cleft, anterior lower-neck notch, costal/aponeurotic windows)
    om_node = next(x for x in dg["nodes"] if x["name"] == "Greater_omentum")
    om_pos = get_buf(dg, db, dg["meshes"][om_node["mesh"]]["primitives"][0]["attributes"]["POSITION"]) * 0.1

    # Symmetrize sample points for balanced sternum & neck gap bridging
    pts_sym = np.vstack([surf_pts, surf_pts * np.array([-1.0, 1.0, 1.0], dtype=np.float32)])
    # Filter extreme shoulder wing tips only for polar patch fitting
    m_patch_src = ~((pts_sym[:, 1] > 14.35) & (np.abs(pts_sym[:, 0]) > 1.70))
    m_patch_src &= ~((pts_sym[:, 1] > 14.70) & (np.abs(pts_sym[:, 0]) > 1.38))
    pts_src = pts_sym[m_patch_src]

    Ny, Nt = 96, 108
    ys = np.linspace(9.05, 15.62, Ny)
    dy = (ys[-1] - ys[0]) / (Ny - 1)
    thetas = np.linspace(0.0, 2.0 * np.pi, Nt, endpoint=False)
    dtheta = 2.0 * np.pi / Nt
    zc = np.where(ys < 13.8, 0.06, 0.06 - 0.29 * np.clip((ys - 13.8) / (15.35 - 13.8), 0.0, 1.0))

    R_patch = np.zeros((Ny, Nt), dtype=np.float32)
    valid = np.zeros((Ny, Nt), dtype=bool)

    for iy, y in enumerate(ys):
        if y >= 15.05:
            t_neck = np.clip((y - 15.05) / (15.62 - 15.05), 0.0, 1.0)
            rx = 0.52 - 0.05 * t_neck
            rz = 0.46 - 0.04 * t_neck
            R_patch[iy] = (rx * rz) / np.sqrt((rz * np.cos(thetas)) ** 2 + (rx * np.sin(thetas)) ** 2)
            valid[iy] = True
            continue
        slab = np.abs(pts_src[:, 1] - y) <= max(dy * 1.3, 0.12)
        s = pts_src[slab]
        if len(s) < 12:
            continue
        ang = np.mod(np.arctan2(s[:, 2] - zc[iy], s[:, 0]), 2.0 * np.pi)
        rad = np.hypot(s[:, 0], s[:, 2] - zc[iy])
        for it, th in enumerate(thetas):
            da = np.abs(np.mod(ang - th + np.pi, 2.0 * np.pi) - np.pi)
            m = da <= dtheta * 0.9
            if np.sum(m) >= 2:
                # Tuck cleanly -0.028 (-2.8 mm) behind outer muscle bellies so muscles sculpt in relief in front
                # without ANY saw-tooth z-fighting or intersecting cutouts!
                R_patch[iy, it] = float(np.percentile(rad[m], 72)) - 0.026
                valid[iy, it] = True
        if np.any(valid[iy]):
            R_patch[iy] = circular_interp_1d(R_patch[iy], valid[iy])
            valid[iy] = True

    R_patch = smooth_polar_grid(R_patch, sigma_y=1.2, sigma_t=1.6)
    for iy, y in enumerate(ys):
        if 14.42 <= y < 15.05:
            t = (y - 14.42) / (15.05 - 14.42)
            st = t * t * (3.0 - 2.0 * t)
            rx, rz = 0.53, 0.47
            r_neck = (rx * rz) / np.sqrt((rz * np.cos(thetas)) ** 2 + (rx * np.sin(thetas)) ** 2)
            R_patch[iy] = (1.0 - st) * R_patch[iy] + st * r_neck

    # Ensure patch liner stays strictly outside Greater_omentum (>= +0.35 cm)
    for iy, y in enumerate(ys):
        slab = np.abs(om_pos[:, 1] - y) <= dy * 1.5
        osub = om_pos[slab]
        if len(osub) == 0:
            continue
        ang = np.mod(np.arctan2(osub[:, 2] - zc[iy], osub[:, 0]), 2.0 * np.pi)
        rad = np.hypot(osub[:, 0], osub[:, 2] - zc[iy])
        for it, th in enumerate(thetas):
            da = np.abs(np.mod(ang - th + np.pi, 2.0 * np.pi) - np.pi)
            m = da <= dtheta * 1.1
            if np.any(m):
                R_patch[iy, it] = max(R_patch[iy, it], float(rad[m].max()) + 0.038)

    R_patch = smooth_polar_grid(R_patch, sigma_y=1.0, sigma_t=1.2)

    # Generate grid vertices and filter triangles ONLY to open anatomical gap zones + 1-ring seam overlap!
    cos_t, sin_t = np.cos(thetas), np.sin(thetas)
    grid_v = np.zeros((Ny, Nt, 3), dtype=np.float32)
    for iy in range(Ny):
        grid_v[iy, :, 0] = R_patch[iy] * cos_t
        grid_v[iy, :, 1] = ys[iy]
        grid_v[iy, :, 2] = zc[iy] + R_patch[iy] * sin_t

    cand_tris = []
    cand_centroids = []
    for iy in range(Ny - 1):
        for it in range(Nt):
            it_n = (it + 1) % Nt
            v00 = iy * Nt + it
            v01 = iy * Nt + it_n
            v10 = (iy + 1) * Nt + it
            v11 = (iy + 1) * Nt + it_n
            p00, p01, p10, p11 = grid_v[iy, it], grid_v[iy, it_n], grid_v[iy + 1, it], grid_v[iy + 1, it_n]
            cand_tris.append([v00, v10, v11])
            cand_centroids.append((p00 + p10 + p11) / 3.0)
            cand_tris.append([v00, v11, v01])
            cand_centroids.append((p00 + p11 + p01) / 3.0)

    cand_tris = np.array(cand_tris, dtype=np.uint32)
    cand_centroids = np.array(cand_centroids, dtype=np.float32)

    # Keep the smooth continuous inner Fascia/Aponeurosis liner unbroken (with smooth bottom/top caps)
    # so there are ZERO jagged cutout triangles anywhere on the chest or abdomen!
    flat_grid_v = grid_v.reshape(-1, 3)
    # Add bottom & top cap vertices so the inner liner has clean smooth silhouettes at pelvis & neck
    bot_c = np.array([[0.0, ys[0] - 0.14, zc[0]]], dtype=np.float32)
    top_c = np.array([[0.0, ys[-1] + 0.02, zc[-1]]], dtype=np.float32)
    all_patch_v = np.vstack([flat_grid_v, bot_c, top_c])
    bot_i = len(flat_grid_v)
    top_i = bot_i + 1
    cap_tris = []
    for it in range(Nt):
        it_n = (it + 1) % Nt
        cap_tris.append([bot_i, it, it_n])
        top_b = (Ny - 1) * Nt
        cap_tris.append([top_b + it, top_i, top_b + it_n])
    patch_tris = np.vstack([cand_tris, np.array(cap_tris, dtype=np.uint32)])

    patch_pos = all_patch_v
    patch_nrm = recompute_vertex_normals(patch_pos, patch_tris.flatten())
    patch_col = np.tile(col_patch, (len(patch_pos), 1))
    patch_idx = patch_tris.flatten().astype(np.uint32)

    print(f"Added seamless continuous inner fascia/aponeurosis liner: {len(patch_pos)} verts, {len(patch_idx)//3} tris")

    # Combine superficial muscles + gap-patch fascia into 1 SINGLE UNIFIED MESH
    all_pos = np.vstack([muscle_pos, patch_pos]).astype(np.float32)
    all_nrm = np.vstack([muscle_nrm, patch_nrm]).astype(np.float32)
    all_col = np.vstack([muscle_col, patch_col]).astype(np.float32)
    all_idx = np.concatenate([muscle_idx, patch_idx + len(muscle_pos)]).astype(np.uint32)

    build_colored_single_mesh_glb(
        TORSO_OUT, all_pos, all_nrm, all_col, all_idx, node_name="Torso_Sculpted_Unified"
    )
    print(
        f"Saved unified high-res sculpted {TORSO_OUT}: "
        f"1 node, {len(all_pos)} verts, {len(all_idx)//3} tris"
    )


if __name__ == "__main__":
    main()
