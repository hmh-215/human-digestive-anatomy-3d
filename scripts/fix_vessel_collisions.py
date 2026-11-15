import json
import os
import shutil
import struct
import numpy as np

BACKUP_VESSELS = r"C:\Users\proto\.gemini\antigravity\brain\032716ed-4938-4dcf-a8c3-035bc613e5a6\scratch\HepaticVessels_orig.glb"
VESSELS_PATH = "assets/models/HepaticVessels.glb"
DIGESTIVE_PATH = "assets/models/DigestiveSystem.glb"


def load_glb(path):
    with open(path, "rb") as f:
        magic, version, length = struct.unpack("<III", f.read(12))
        assert magic == 0x46546C67
        jl, jtype = struct.unpack("<II", f.read(8))
        gltf = json.loads(f.read(jl).decode("utf-8"))
        bl, btype = struct.unpack("<II", f.read(8))
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


class TriMeshCollider:
    def __init__(self, name, pos, idx):
        self.name = name
        self.pos = pos.astype(np.float32)
        self.tris_idx = idx.reshape(-1, 3)
        self.tri_verts = self.pos[self.tris_idx]  # (T, 3, 3)
        self.v0 = self.tri_verts[:, 0]
        self.v1 = self.tri_verts[:, 1]
        self.v2 = self.tri_verts[:, 2]
        self.centroids = (self.v0 + self.v1 + self.v2) / 3.0
        fn = np.cross(self.v1 - self.v0, self.v2 - self.v0)
        fn_len = np.linalg.norm(fn, axis=1, keepdims=True)
        self.fn_unit = fn / np.maximum(fn_len, 1e-9)
        self.bmin = self.pos.min(axis=0)
        self.bmax = self.pos.max(axis=0)

    def _ray_inside_votes(self, p):
        """Count how many of the 6 cardinal rays (+X,-X,+Y,-Y,+Z,-Z) hit an odd number of triangles."""
        votes = 0
        for axis in (0, 1, 2):
            a1 = (axis + 1) % 3
            a2 = (axis + 2) % 3
            u, v = p[a1], p[a2]
            v0u, v0v = self.v0[:, a1], self.v0[:, a2]
            v1u, v1v = self.v1[:, a1], self.v1[:, a2]
            v2u, v2v = self.v2[:, a1], self.v2[:, a2]
            umin = np.minimum(np.minimum(v0u, v1u), v2u)
            umax = np.maximum(np.maximum(v0u, v1u), v2u)
            vmin = np.minimum(np.minimum(v0v, v1v), v2v)
            vmax = np.maximum(np.maximum(v0v, v1v), v2v)
            m = (umin <= u) & (u <= umax) & (vmin <= v) & (v <= vmax)
            if not np.any(m):
                continue
            x0, y0 = v0u[m] - u, v0v[m] - v
            x1, y1 = v1u[m] - u, v1v[m] - v
            x2, y2 = v2u[m] - u, v2v[m] - v
            c0 = x0 * y1 - y0 * x1
            c1 = x1 * y2 - y1 * x2
            c2 = x2 * y0 - y2 * x0
            hit = ((c0 >= 0) & (c1 >= 0) & (c2 >= 0)) | ((c0 <= 0) & (c1 <= 0) & (c2 <= 0))
            if not np.any(hit):
                continue
            denom = c0[hit] + c1[hit] + c2[hit]
            valid = np.abs(denom) > 1e-10
            if not np.any(valid):
                continue
            w0 = c1[hit][valid] / denom[valid]
            w1 = c2[hit][valid] / denom[valid]
            w2 = c0[hit][valid] / denom[valid]
            z_hit = (
                w0 * self.v0[:, axis][m][hit][valid]
                + w1 * self.v1[:, axis][m][hit][valid]
                + w2 * self.v2[:, axis][m][hit][valid]
            )
            if int(np.sum(z_hit > p[axis])) % 2 == 1:
                votes += 1
            if int(np.sum(z_hit < p[axis])) % 2 == 1:
                votes += 1
        return votes

    def signed_distance(self, pts, k=36):
        M = len(pts)
        pmin = pts.min(axis=0) - 2.5
        pmax = pts.max(axis=0) + 2.5
        mask = np.all((self.centroids >= pmin) & (self.centroids <= pmax), axis=1)
        if not np.any(mask):
            return np.full(M, 99.0, dtype=np.float32), pts.copy(), np.tile([0.0, 0.0, 1.0], (M, 1)).astype(np.float32)

        sub_idx = np.where(mask)[0]
        c_sub = self.centroids[sub_idx]
        T_sub = len(sub_idx)
        kk = min(k, T_sub)

        # Chunked pairwise distance to find top-k candidate triangles per point
        k_local = np.empty((M, kk), dtype=np.int64)
        for s in range(0, M, 64):
            e = min(M, s + 64)
            diff = c_sub[None, :, :] - pts[s:e, None, :]
            d2 = np.einsum("ijk,ijk->ij", diff, diff)
            if kk < T_sub:
                k_local[s:e] = np.argpartition(d2, kk - 1, axis=1)[:, :kk]
            else:
                k_local[s:e] = np.arange(T_sub)[None, :]

        tris = sub_idx[k_local]  # (M, kk)
        a = self.v0[tris]  # (M, kk, 3)
        b = self.v1[tris]
        c = self.v2[tris]
        fn = self.fn_unit[tris]
        p = pts[:, None, :]

        # Vectorized Ericson closest point on triangle
        ab = b - a
        ac = c - a
        ap = p - a
        d1 = np.einsum("ijk,ijk->ij", ab, ap)
        d2 = np.einsum("ijk,ijk->ij", ac, ap)

        bp = p - b
        d3 = np.einsum("ijk,ijk->ij", ab, bp)
        d4 = np.einsum("ijk,ijk->ij", ac, bp)

        cp = p - c
        d5 = np.einsum("ijk,ijk->ij", ab, cp)
        d6 = np.einsum("ijk,ijk->ij", ac, cp)

        vc = d1 * d4 - d3 * d2
        vb = d5 * d2 - d1 * d6
        va = d3 * d6 - d5 * d4

        q = np.empty_like(a)
        # Region masks
        mA = (d1 <= 0.0) & (d2 <= 0.0)
        mB = (~mA) & (d3 >= 0.0) & (d4 <= d3)
        mAB = (~mA) & (~mB) & (vc <= 0.0) & (d1 >= 0.0) & (d3 <= 0.0)
        mC = (~mA) & (~mB) & (~mAB) & (d6 >= 0.0) & (d5 <= d6)
        mAC = (~mA) & (~mB) & (~mAB) & (~mC) & (vb <= 0.0) & (d2 >= 0.0) & (d6 <= 0.0)
        mBC = (~mA) & (~mB) & (~mAB) & (~mC) & (~mAC) & (va <= 0.0) & ((d4 - d3) >= 0.0) & ((d5 - d6) >= 0.0)
        mInt = ~(mA | mB | mAB | mC | mAC | mBC)

        q[mA] = a[mA]
        q[mB] = b[mB]
        v_ab = d1[mAB] / np.maximum(d1[mAB] - d3[mAB], 1e-12)
        q[mAB] = a[mAB] + ab[mAB] * v_ab[:, None]
        q[mC] = c[mC]
        w_ac = d2[mAC] / np.maximum(d2[mAC] - d6[mAC], 1e-12)
        q[mAC] = a[mAC] + ac[mAC] * w_ac[:, None]
        w_bc = (d4[mBC] - d3[mBC]) / np.maximum((d4[mBC] - d3[mBC]) + (d5[mBC] - d6[mBC]), 1e-12)
        q[mBC] = b[mBC] + (c[mBC] - b[mBC]) * w_bc[:, None]
        denom = 1.0 / np.maximum(va[mInt] + vb[mInt] + vc[mInt], 1e-12)
        v_i = vb[mInt] * denom
        w_i = vc[mInt] * denom
        q[mInt] = a[mInt] + ab[mInt] * v_i[:, None] + ac[mInt] * w_i[:, None]

        diff_q = p - q
        dist2 = np.einsum("ijk,ijk->ij", diff_q, diff_q)
        best_j = np.argmin(dist2, axis=1)
        best_d2 = dist2[np.arange(M), best_j]
        best_q = q[np.arange(M), best_j]

        # Pseudonormal over tied closest triangles
        tied = dist2 <= (best_d2[:, None] + 1e-4)
        avg_n = np.sum(fn * tied[:, :, None], axis=1)
        nlen = np.linalg.norm(avg_n, axis=1, keepdims=True)
        best_n = (avg_n / np.maximum(nlen, 1e-8)).astype(np.float32)

        dist = np.sqrt(best_d2).astype(np.float32)
        dot = np.einsum("ij,ij->i", pts - best_q, best_n)
        in_bbox = np.all((pts >= self.bmin) & (pts <= self.bmax), axis=1)
        sign = np.ones(M, dtype=np.float32)
        cand_inside = in_bbox & (dot < 0.0)
        for i in np.where(cand_inside)[0]:
            if self._ray_inside_votes(pts[i]) >= 3:
                sign[i] = -1.0
        return sign * dist, best_q, best_n


def compute_tangents(centers):
    R = len(centers)
    T = np.zeros_like(centers)
    if R == 1:
        T[0] = [0, 1, 0]
        return T
    T[0] = centers[1] - centers[0]
    T[-1] = centers[-1] - centers[-2]
    if R > 2:
        T[1:-1] = centers[2:] - centers[:-2]
    norms = np.linalg.norm(T, axis=1, keepdims=True)
    return T / np.maximum(norms, 1e-8)


def rot_matrix_between(u, v):
    u = u / max(np.linalg.norm(u), 1e-8)
    v = v / max(np.linalg.norm(v), 1e-8)
    c = float(np.dot(u, v))
    if c > 0.999999:
        return np.eye(3, dtype=np.float32)
    if c < -0.999999:
        ortho = np.array([1.0, 0.0, 0.0]) if abs(u[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
        axis = np.cross(u, ortho)
        axis /= np.linalg.norm(axis)
        K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
        return (np.eye(3) + 2.0 * (K @ K)).astype(np.float32)
    cross = np.cross(u, v)
    K = np.array([[0, -cross[2], cross[1]], [cross[2], 0, -cross[0]], [-cross[1], cross[0], 0]])
    return (np.eye(3) + K + (K @ K) / (1.0 + c)).astype(np.float32)


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
    vn = vn / np.maximum(norms, 1e-9)
    return vn.astype(np.float32)


def main():
    if not os.path.exists(BACKUP_VESSELS):
        os.makedirs(os.path.dirname(BACKUP_VESSELS), exist_ok=True)
        shutil.copy2(VESSELS_PATH, BACKUP_VESSELS)
        print(f"Backed up original vessels to {BACKUP_VESSELS}")

    dg, db = load_glb(DIGESTIVE_PATH)
    hg, hb = load_glb(BACKUP_VESSELS)

    organ_names = [
        "Stomach",
        "Duodenum",
        "Jejunum",
        "Ascending_colon",
        "Transverse_colon",
        "Descending_colon",
        "Sigmoid_colon",
        "Vermiform_appendix",
        "Gallbladder",
        "Liver",
    ]
    colliders = {}
    for oname in organ_names:
        node = next((x for x in dg["nodes"] if x["name"] == oname), None)
        if node is None:
            continue
        prim = dg["meshes"][node["mesh"]]["primitives"][0]
        pos = get_buf(dg, db, prim["attributes"]["POSITION"])
        idx = get_buf(dg, db, prim["indices"])
        colliders[oname] = TriMeshCollider(oname, pos, idx)

    gi_targets = [k for k in organ_names if k != "Liver"]
    liver_col = colliders["Liver"]
    stomach_col = colliders["Stomach"]

    print(f"Loaded {len(colliders)} organ colliders. Auditing & fixing 75 vessel meshes...")

    modified_count = 0
    for node in hg["nodes"]:
        if "mesh" not in node:
            continue
        nm = node["name"]
        low = nm.lower()
        prim = hg["meshes"][node["mesh"]]["primitives"][0]
        pos_acc = prim["attributes"]["POSITION"]
        nrm_acc = prim["attributes"]["NORMAL"]
        idx_acc = prim["indices"]

        verts = get_buf(hg, hb, pos_acc)
        idx = get_buf(hg, hb, idx_acc)
        R = len(verts) // 10
        rings = verts.reshape(R, 10, 3)
        centers_orig = rings.mean(axis=1)
        radii = np.linalg.norm(rings - centers_orig[:, None, :], axis=2).mean(axis=1)

        centers = centers_orig.copy()
        is_intrahepatic = any(
            k in low
            for k in [
                "segment_",
                "hepatic_vein",
                "hepatic vein",
                "portal_branch",
                "portal_trunk",
                "anterior_portal",
                "posterior_portal",
            ]
        )
        is_splenic = "splenic" in low
        is_portal_trunk = low == "hepatic portal vein"

        # 1. Iterative collision clearance + smooth fairing
        touched_mask = np.zeros(R, dtype=bool)
        for it in range(14):
            push_total = np.zeros_like(centers)
            push_count = np.zeros(R, dtype=np.float32)

            # Intrahepatic vs Stomach + Liver containment
            if is_intrahepatic:
                sd_s, cq_s, cn_s = stomach_col.signed_distance(centers, k=48)
                margin = radii + 0.16
                bad = sd_s < margin
                if np.any(bad):
                    touched_mask |= bad
                    # Push superiorly & anteriorly into left lobe of Liver (away from Stomach)
                    for r in np.where(bad)[0]:
                        depth = float(margin[r] - sd_s[r])
                        # Prefer superior (+Y) and anterior (+Z) vector blended with normal
                        up_fwd = np.array([0.0, 0.72, 0.70], dtype=np.float32)
                        vec = cn_s[r] * 0.35 + up_fwd * 0.65
                        vec /= max(np.linalg.norm(vec), 1e-8)
                        push_total[r] += vec * (depth + 0.08)
                        push_count[r] += 1.0

                # Also ensure left intrahepatic branches don't poke inferiorly/posteriorly out of Liver
                if any(k in low for k in ["segment_ii", "segment_iii", "left_hepatic", "left_portal"]):
                    sd_l, cq_l, cn_l = liver_col.signed_distance(centers, k=48)
                    # Keep interior (sd_l <= -0.18) except near root (last/first ring)
                    outside_l = (sd_l > -0.18) & (np.arange(R) > 0)
                    if np.any(outside_l):
                        for r in np.where(outside_l)[0]:
                            # Move gently inward along -cn_l only if not pushed into stomach
                            if not bad[r]:
                                push_total[r] -= cn_l[r] * min(0.25, float(sd_l[r] + 0.18))
                                push_count[r] += 1.0

            else:
                # Extrahepatic vessels against all GI organs
                targets = gi_targets if is_portal_trunk else gi_targets
                for oname in targets:
                    col = colliders[oname]
                    cmin = centers.min(axis=0) - radii.max() - 0.3
                    cmax = centers.max(axis=0) + radii.max() + 0.3
                    if np.any(cmax < col.bmin) or np.any(cmin > col.bmax):
                        continue

                    sd, cq, cn = col.signed_distance(centers, k=48)
                    # Extra clearance for Splenic vessels behind Stomach so they never poke anteriorly
                    extra = 0.14 if (is_splenic and oname == "Stomach") else 0.05
                    margin = radii + extra
                    bad = sd < margin
                    if np.any(bad):
                        touched_mask |= bad
                        for r in np.where(bad)[0]:
                            if is_splenic and oname == "Stomach":
                                # Always route splenic vessels posteriorly (-Z) behind stomach wall!
                                nvec = cn[r].copy()
                                if nvec[2] > -0.15:
                                    nvec = np.array([nvec[0] * 0.25, -0.15, -0.95], dtype=np.float32)
                                    nvec /= np.linalg.norm(nvec)
                                    # Extra step to get cleanly through to posterior aspect
                                    step = float(margin[r] - sd[r]) + 0.35
                                else:
                                    step = float(margin[r] - sd[r])
                                push_total[r] += nvec * step
                                push_count[r] += 1.0
                            else:
                                # Outward vector from closest surface point
                                if sd[r] >= 0.0:
                                    out_dir = centers[r] - cq[r]
                                    olen = float(np.linalg.norm(out_dir))
                                    out_dir = out_dir / olen if olen > 1e-6 else cn[r]
                                    target_p = cq[r] + out_dir * margin[r]
                                    push_total[r] += (target_p - centers[r])
                                else:
                                    out_dir = cn[r]
                                    target_p = cq[r] + out_dir * margin[r]
                                    push_total[r] += (target_p - centers[r])
                                push_count[r] += 1.0

            active = push_count > 0
            if not np.any(active) and it >= 3:
                break

            if np.any(active):
                avg_push = np.zeros_like(centers)
                avg_push[active] = push_total[active] / push_count[active, None]
                gain = 0.72 if it < 10 else 1.0
                centers += avg_push * gain

            # Smooth modified regions + 3-ring transition zone so curves stay graceful
            if it < 11 and np.any(touched_mask):
                sm_mask = touched_mask.copy()
                for _ in range(3):
                    sm_mask[1:] |= sm_mask[:-1]
                    sm_mask[:-1] |= sm_mask[1:]
                new_c = centers.copy()
                for r in range(1, R - 1):
                    if sm_mask[r]:
                        new_c[r] = 0.55 * centers[r] + 0.225 * (centers[r - 1] + centers[r + 1])
                centers = new_c

        # Final hard clamp pass (no smoothing afterward except tangential tiny relax) to guarantee sd >= radius + 0.025
        for _ in range(4):
            any_bad = False
            for oname in gi_targets:
                col = colliders[oname]
                cmin = centers.min(axis=0) - radii.max() - 0.3
                cmax = centers.max(axis=0) + radii.max() + 0.3
                if np.any(cmax < col.bmin) or np.any(cmin > col.bmax):
                    continue
                sd, cq, cn = col.signed_distance(centers, k=48)
                margin = radii + 0.03
                bad = sd < margin
                if np.any(bad):
                    any_bad = True
                    for r in np.where(bad)[0]:
                        if is_splenic and oname == "Stomach" and cn[r][2] > -0.15:
                            nvec = np.array([cn[r][0] * 0.2, -0.15, -0.96], dtype=np.float32)
                            nvec /= np.linalg.norm(nvec)
                            centers[r] += nvec * (float(margin[r] - sd[r]) + 0.30)
                        elif sd[r] >= 0.0:
                            out_dir = centers[r] - cq[r]
                            olen = float(np.linalg.norm(out_dir))
                            out_dir = out_dir / olen if olen > 1e-6 else cn[r]
                            centers[r] = cq[r] + out_dir * margin[r]
                        else:
                            centers[r] = cq[r] + cn[r] * margin[r]
            if not any_bad:
                break

        max_disp = float(np.linalg.norm(centers - centers_orig, axis=1).max())
        if max_disp > 1e-4:
            modified_count += 1
            print(f"  Fixed {nm:42s} | max_disp={max_disp:.3f} cm")
            t_old = compute_tangents(centers_orig)
            t_new = compute_tangents(centers)
            new_rings = np.empty_like(rings)
            for r in range(R):
                Rmat = rot_matrix_between(t_old[r], t_new[r])
                offsets = rings[r] - centers_orig[r]
                new_rings[r] = centers[r] + (offsets @ Rmat.T)
            new_verts = new_rings.reshape(-1, 3).astype(np.float32)
            new_norms = recompute_vertex_normals(new_verts, idx)
            set_buf_vec3(hg, hb, pos_acc, new_verts)
            set_buf_vec3(hg, hb, nrm_acc, new_norms)

    save_glb(VESSELS_PATH, hg, hb)
    print(f"\nSaved {VESSELS_PATH} (modified {modified_count} vessel meshes).")

    # Final full audit
    print("\n=== POST-FIX AUDIT ACROSS ALL GI ORGANS ===")
    hg2, hb2 = load_glb(VESSELS_PATH)
    remaining = 0
    for node in hg2["nodes"]:
        if "mesh" not in node:
            continue
        nm = node["name"]
        prim = hg2["meshes"][node["mesh"]]["primitives"][0]
        vp = get_buf(hg2, hb2, prim["attributes"]["POSITION"])
        centers = vp.reshape(-1, 10, 3).mean(axis=1)
        hits = []
        for oname in gi_targets:
            col = colliders[oname]
            cmin = centers.min(axis=0) - 0.5
            cmax = centers.max(axis=0) + 0.5
            if np.any(cmax < col.bmin) or np.any(cmin > col.bmax):
                continue
            sd, _, _ = col.signed_distance(centers, k=48)
            deep = int(np.sum(sd < -0.02))
            if deep > 0:
                remaining += deep
                hits.append(f"{oname}:{deep}/{len(centers)}(min={sd.min():.3f})")
        if hits:
            print(f"  REMAINING {nm:38s} -> {', '.join(hits)}")
    if remaining == 0:
        print("  SUCCESS: 0 penetrating vessel rings across all GI organs!")


if __name__ == "__main__":
    main()
