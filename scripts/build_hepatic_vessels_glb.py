import struct
import json
import math
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

WORKSPACE = r'd:\huong\antigravity\digestion_system_study'
OUTPUT_GLB = os.path.join(WORKSPACE, 'assets', 'models', 'HepaticVessels.glb')
BLEND_PATH = r'D:\huong\antigravity\châm cứu\3D-models\Z-Anatomy\Startup.blend'

# Z-Anatomy master curve sources for intestinal and abdominal vessels
BLEND_VESSEL_SOURCES = [
    # (Curve Name, OB Name, organId, displayName, defRadius, category)
    ('CUHepatic portal vein', 'OBHepatic portal vein', 'portal_system', 'Thân Tĩnh Mạch Cửa (Vena Portae Hepatis)', 0.0055, 'portal_trunk'),
    ('CUSuperior mesenteric vein', 'OBSuperior mesenteric vein', 'portal_system', 'Tĩnh Mạch Mạc Treo Tràng Trên (SMV)', 0.0045, 'mesenteric_vein'),
    ('CUInferior mesenteric vein', 'OBInferior mesenteric vein', 'portal_system', 'Tĩnh Mạch Mạc Treo Tràng Dưới (IMV)', 0.0035, 'mesenteric_vein'),
    ('CURight colic vein', 'OBRight colic vein', 'portal_system', 'Các Nhánh TM Đại Tràng Phải (Right Colic Veins)', 0.0028, 'mesenteric_vein'),
    ('CUMiddle colic vein', 'OBMiddle colic vein', 'portal_system', 'Các Nhánh TM Đại Tràng Giữa (Middle Colic Veins)', 0.0030, 'mesenteric_vein'),
    ('CUSplenic vein', 'OBSplenic vein', 'portal_system', 'Tĩnh Mạch Lách & Nhánh Tụy Vị (Splenic Vein)', 0.0040, 'splenic_vein'),
    ('CURight gastro-omental vein', 'OBRight gastro-omental vein', 'portal_system', 'TM Mạc Nối Dạ Dày Phải (Right Gastro-omental Vein)', 0.0025, 'gastric_vein'),
    ('CULeft gastro-omental vein', 'OBLeft gastro-omental vein', 'portal_system', 'TM Mạc Nối Dạ Dày Trái (Left Gastro-omental Vein)', 0.0025, 'gastric_vein'),
    ('CUInferior vena cava (abdominal part)', 'OBInferior vena cava (abdominal part)', 'hepatic_veins', 'Tĩnh Mạch Chủ Dưới (IVC - Đoạn Bụng)', 0.0110, 'cava'),
    ('CUHepatic veins', 'OBHepatic veins', 'hepatic_veins', 'Gốc Các Tĩnh Mạch Trên Gan (Hepatic Vein Roots)', 0.0050, 'hepatic_vein'),
    ('CUCoeliac trunk', 'OBCoeliac trunk', 'hepatic_artery', 'Thân Tạng (Truncus Coeliacus)', 0.0040, 'artery'),
    ('CUCommon hepatic artery', 'OBCommon hepatic artery', 'hepatic_artery', 'Động Mạch Gan Chung (CHA)', 0.0035, 'artery'),
    ('CUProper hepatic artery', 'OBProper hepatic artery', 'hepatic_artery', 'Động Mạch Gan Riêng (PHA)', 0.0030, 'artery'),
    ('CUGastroduodenal artery', 'OBGastroduodenal artery', 'hepatic_artery', 'Động Mạch Vị Tá Tràng (GDA)', 0.0025, 'artery'),
    ('CUSplenic artery', 'OBSplenic artery', 'hepatic_artery', 'Động Mạch Lách (Splenic Artery)', 0.0035, 'artery'),
    ('CULeft gastric artery', 'OBLeft gastric artery', 'hepatic_artery', 'Động Mạch Vị Trái (LGA)', 0.0025, 'artery'),
    ('CUSuperior mesenteric artery', 'OBSuperior mesenteric artery', 'hepatic_artery', 'ĐM Mạc Treo Tràng Trên & Nhánh Ruột Non (SMA)', 0.0042, 'artery'),
    ('CUIleocolic artery', 'OBIleocolic artery', 'hepatic_artery', 'ĐM Hồi Đại Tràng (Ileocolic Artery)', 0.0028, 'artery'),
    ('CUIleal branch of ileocolic artery', 'OBIleal branch of ileocolic artery', 'hepatic_artery', 'Nhánh Hồi Tràng ĐM Hồi Đại Tràng', 0.0022, 'artery'),
    ('CUColic branch of ileocolic artery', 'OBColic branch of ileocolic artery', 'hepatic_artery', 'Nhánh Đại Tràng ĐM Hồi Đại Tràng', 0.0022, 'artery'),
    ('CURight colic artery', 'OBRight colic artery', 'hepatic_artery', 'ĐM Đại Tràng Phải (Right Colic Artery)', 0.0025, 'artery'),
    ('CUMiddle colic artery', 'OBMiddle colic artery', 'hepatic_artery', 'ĐM Đại Tràng Giữa (Middle Colic Artery)', 0.0028, 'artery'),
    ('CULeft colic artery', 'OBLeft colic artery', 'hepatic_artery', 'ĐM Đại Tràng Trái (Left Colic Artery)', 0.0025, 'artery')
]

def transform_point(p, mat):
    x = p[0]*mat[0] + p[1]*mat[4] + p[2]*mat[8] + mat[12]
    y = p[0]*mat[1] + p[1]*mat[5] + p[2]*mat[9] + mat[13]
    z = p[0]*mat[2] + p[1]*mat[6] + p[2]*mat[10] + mat[14]
    return (x * 100.0, z * 100.0, -y * 100.0)

def interpolate_catmull_rom(pts, num_out):
    if len(pts) < 2:
        return pts
    # Add ghost endpoints for natural clamped tangents
    p_ext = [pts[0]] + pts + [pts[-1]]
    res = []
    num_segs = len(pts) - 1
    for s in range(num_segs):
        p0, p1, p2, p3 = p_ext[s], p_ext[s+1], p_ext[s+2], p_ext[s+3]
        steps = max(2, num_out // num_segs)
        for step in range(steps if s == num_segs - 1 else steps):
            t = step / steps
            t2 = t * t
            t3 = t2 * t
            # Catmull-Rom basis matrix (s=0.5)
            x = 0.5 * ((2*p1[0]) + (-p0[0] + p2[0])*t + (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0])*t2 + (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0])*t3)
            y = 0.5 * ((2*p1[1]) + (-p0[1] + p2[1])*t + (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1])*t2 + (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1])*t3)
            z = 0.5 * ((2*p1[2]) + (-p0[2] + p2[2])*t + (2*p0[2] - 5*p1[2] + 4*p2[2] - p3[2])*t2 + (-p0[2] + 3*p1[2] - 3*p2[2] + p3[2])*t3)
            res.append((x, y, z))
    res.append(pts[-1])
    return res

def generate_tube_mesh(points, radii, name, organ_id, display_name, couinaud_seg=None, vessel_role=None):
    if len(points) < 2:
        return None

    radial_segments = 10
    segments = len(points) - 1

    tangents = []
    for i in range(len(points)):
        if i == 0:
            d = (points[1][0]-points[0][0], points[1][1]-points[0][1], points[1][2]-points[0][2])
        elif i == len(points) - 1:
            d = (points[i][0]-points[i-1][0], points[i][1]-points[i-1][1], points[i][2]-points[i-1][2])
        else:
            d = (points[i+1][0]-points[i-1][0], points[i+1][1]-points[i-1][1], points[i+1][2]-points[i-1][2])
        l = math.sqrt(d[0]*d[0] + d[1]*d[1] + d[2]*d[2]) or 1.0
        tangents.append((d[0]/l, d[1]/l, d[2]/l))

    normals = []
    binormals = []
    t0 = tangents[0]
    up = (0.0, 1.0, 0.0) if abs(t0[1]) < 0.9 else (1.0, 0.0, 0.0)
    n0 = (up[1]*t0[2] - up[2]*t0[1], up[2]*t0[0] - up[0]*t0[2], up[0]*t0[1] - up[1]*t0[0])
    l = math.sqrt(n0[0]**2 + n0[1]**2 + n0[2]**2) or 1.0
    n0 = (n0[0]/l, n0[1]/l, n0[2]/l)
    b0 = (t0[1]*n0[2] - t0[2]*n0[1], t0[2]*n0[0] - t0[0]*n0[2], t0[0]*n0[1] - t0[1]*n0[0])
    normals.append(n0)
    binormals.append(b0)

    for i in range(segments):
        t1 = tangents[i]
        t2 = tangents[i+1]
        a = (t1[1]*t2[2] - t1[2]*t2[1], t1[2]*t2[0] - t1[0]*t2[2], t1[0]*t2[1] - t1[1]*t2[0])
        sin_angle = math.sqrt(a[0]**2 + a[1]**2 + a[2]**2)
        cos_angle = t1[0]*t2[0] + t1[1]*t2[1] + t1[2]*t2[2]
        if sin_angle > 1e-6:
            axis = (a[0]/sin_angle, a[1]/sin_angle, a[2]/sin_angle)
            angle = math.atan2(sin_angle, cos_angle)
            v = normals[i]
            k = axis
            c = math.cos(angle)
            s = math.sin(angle)
            dot = v[0]*k[0] + v[1]*k[1] + v[2]*k[2]
            cross = (k[1]*v[2] - k[2]*v[1], k[2]*v[0] - k[0]*v[2], k[0]*v[1] - k[1]*v[0])
            n_next = (v[0]*c + cross[0]*s + k[0]*dot*(1.0-c),
                      v[1]*c + cross[1]*s + k[0]*dot*(1.0-c),
                      v[2]*c + cross[2]*s + k[2]*dot*(1.0-c))
            nl = math.sqrt(n_next[0]**2 + n_next[1]**2 + n_next[2]**2) or 1.0
            n_next = (n_next[0]/nl, n_next[1]/nl, n_next[2]/nl)
            b_next = (t2[1]*n_next[2] - t2[2]*n_next[1], t2[2]*n_next[0] - t2[0]*n_next[2], t2[0]*n_next[1] - t2[1]*n_next[0])
            normals.append(n_next)
            binormals.append(b_next)
        else:
            normals.append(normals[i])
            binormals.append(binormals[i])

    vertices = []
    vertex_normals = []
    uvs = []
    indices = []

    for i in range(len(points)):
        p = points[i]
        r = radii[i]
        n = normals[i]
        b = binormals[i]
        v_coord = i / (len(points) - 1)
        for j in range(radial_segments):
            angle = j * 2.0 * math.pi / radial_segments
            cos_a = math.cos(angle)
            sin_a = math.sin(angle)
            norm_x = n[0] * cos_a + b[0] * sin_a
            norm_y = n[1] * cos_a + b[1] * sin_a
            norm_z = n[2] * cos_a + b[2] * sin_a
            vx = p[0] + r * norm_x
            vy = p[1] + r * norm_y
            vz = p[2] + r * norm_z
            vertices.append((vx, vy, vz))
            vertex_normals.append((norm_x, norm_y, norm_z))
            uvs.append((j / radial_segments, v_coord))

    for i in range(segments):
        for j in range(radial_segments):
            j_next = (j + 1) % radial_segments
            i0 = i * radial_segments + j
            i1 = i * radial_segments + j_next
            i2 = (i + 1) * radial_segments + j
            i3 = (i + 1) * radial_segments + j_next
            indices.extend([i0, i2, i1, i1, i2, i3])

    return {
        'name': name,
        'organId': organ_id,
        'displayName': display_name,
        'couinaudSeg': couinaud_seg,
        'vesselRole': vessel_role,
        'vertices': vertices,
        'normals': vertex_normals,
        'uvs': uvs,
        'indices': indices
    }

def build_couinaud_vascular_tree():
    """
    Constructs the authentic Couinaud liver vascular tree:
    1. The 3 Intersegmental Hepatic Veins (Right, Middle, Left) running in the 3 vertical fissures to the IVC.
    2. The 8 Glissonian Segmental Portal & Arterial Pedicles entering the core of Segments I to VIII.
    """
    couinaud_meshes = []

    # Centers of the 8 Couinaud Segments (calculated from true Z-Anatomy vertex centroids)
    seg_centers = {
        'segment_I':   (-1.16, 120.24, 2.39),   # Caudate lobe (Spigel)
        'segment_II':  (4.62, 121.81, 4.67),    # Left posterior lateral (Superior)
        'segment_III': (3.54, 119.03, 6.13),    # Left anterior lateral (Inferior)
        'segment_IV':  (-1.78, 118.99, 6.13),   # Left medial (Quadrate lobe)
        'segment_V':   (-6.56, 114.82, 5.25),   # Right anterior medial (Inferior)
        'segment_VI':  (-6.86, 113.54, 0.70),   # Right posterior lateral (Inferior)
        'segment_VII': (-6.77, 120.31, -0.04),  # Right posterior lateral (Superior)
        'segment_VIII':(-6.35, 121.73, 3.52)   # Right anterior medial (Superior)
    }

    # =========================================================================
    # A. THE 3 MAJOR HEPATIC VEINS (Intersegmental Venous Cleavage Planes)
    # =========================================================================
    ivc_drainage_pt = (-0.75, 124.2, 0.8)

    # 1. Middle Hepatic Vein (Cantlie's line: separates Right V/VIII and Left IV)
    mhv_pts = [
        (-3.8, 115.5, 5.2),
        (-3.0, 117.8, 4.4),
        (-2.2, 120.5, 3.1),
        (-1.4, 122.8, 1.8),
        ivc_drainage_pt
    ]
    mhv_smooth = interpolate_catmull_rom(mhv_pts, 16)
    mhv_radii = [0.28 + (i/len(mhv_smooth))*0.20 for i in range(len(mhv_smooth))] # 2.8mm to 4.8mm
    couinaud_meshes.append(generate_tube_mesh(
        mhv_smooth, mhv_radii, 'Middle_hepatic_vein', 'hepatic_veins',
        'Tĩnh Mạch Gan Giữa (Middle Hepatic Vein - Khe chính Cantlie)',
        couinaud_seg=None, vessel_role='hepatic_vein'
    ))

    # 2. Right Hepatic Vein (Right scissure: separates Right Lateral VI/VII and Medial V/VIII)
    rhv_pts = [
        (-8.2, 114.2, 1.4),
        (-7.8, 116.8, 1.5),
        (-7.0, 119.5, 1.6),
        (-4.5, 122.2, 1.4),
        (-1.2, 123.8, 0.9),
        ivc_drainage_pt
    ]
    rhv_smooth = interpolate_catmull_rom(rhv_pts, 18)
    rhv_radii = [0.30 + (i/len(rhv_smooth))*0.25 for i in range(len(rhv_smooth))] # 3.0mm to 5.5mm
    couinaud_meshes.append(generate_tube_mesh(
        rhv_smooth, rhv_radii, 'Right_hepatic_vein', 'hepatic_veins',
        'Tĩnh Mạch Gan Phải (Right Hepatic Vein - Khe liên phân thùy phải)',
        couinaud_seg=None, vessel_role='hepatic_vein'
    ))

    # 3. Left Hepatic Vein (Left scissure: separates Left Lateral II/III and Medial IV)
    lhv_pts = [
        (2.8, 118.5, 5.6),
        (2.2, 120.2, 4.4),
        (1.2, 122.0, 2.8),
        (-0.2, 123.5, 1.4),
        ivc_drainage_pt
    ]
    lhv_smooth = interpolate_catmull_rom(lhv_pts, 16)
    lhv_radii = [0.26 + (i/len(lhv_smooth))*0.18 for i in range(len(lhv_smooth))] # 2.6mm to 4.4mm
    couinaud_meshes.append(generate_tube_mesh(
        lhv_smooth, lhv_radii, 'Left_hepatic_vein', 'hepatic_veins',
        'Tĩnh Mạch Gan Trái (Left Hepatic Vein - Khe liên phân thùy trái)',
        couinaud_seg=None, vessel_role='hepatic_vein'
    ))

    # =========================================================================
    # B. THE 8 SEGMENTAL GLISSONIAN PORTAL VEIN BRANCHES (Vena Portae)
    # =========================================================================
    porta_bifurcation = (-1.5, 117.5, 3.2)
    right_portal_trunk = (-4.2, 117.0, 3.0)
    left_portal_trunk = (0.2, 118.0, 3.8)
    left_umbilical_turn = (1.2, 118.5, 5.2)

    # 1. Main Right & Left Portal Trunks
    r_trunk_pts = interpolate_catmull_rom([porta_bifurcation, (-2.8, 117.2, 3.1), right_portal_trunk], 8)
    couinaud_meshes.append(generate_tube_mesh(
        r_trunk_pts, [0.45]*len(r_trunk_pts), 'Right_portal_trunk', 'portal_system',
        'Nhánh Phải Tĩnh Mạch Cửa (Ramus Dexter Venae Portae)', couinaud_seg=None, vessel_role='portal_branch'
    ))

    l_trunk_pts = interpolate_catmull_rom([porta_bifurcation, (-0.6, 117.8, 3.5), left_portal_trunk, left_umbilical_turn], 10)
    couinaud_meshes.append(generate_tube_mesh(
        l_trunk_pts, [0.40]*len(l_trunk_pts), 'Left_portal_trunk', 'portal_system',
        'Nhánh Trái Tĩnh Mạch Cửa & Đoạn Rốn (Ramus Sinister & Pars Umbilicalis)', couinaud_seg=None, vessel_role='portal_branch'
    ))

    # 2. Segment I (Caudate Lobe / Spigel) Pedicle
    seg1_pts = interpolate_catmull_rom([left_portal_trunk, (-0.4, 119.2, 3.0), seg_centers['segment_I']], 8)
    couinaud_meshes.append(generate_tube_mesh(
        seg1_pts, [0.18]*len(seg1_pts), 'Portal_vein_segment_I', 'portal_system',
        'Nhánh Cửa Hạ Phân Thùy I (Caudate / Spigel)', couinaud_seg='segment_I', vessel_role='segmental_portal'
    ))

    # 3. Segment II (Left Posterior Lateral Superior) Pedicle
    seg2_pts = interpolate_catmull_rom([left_umbilical_turn, (2.6, 119.8, 4.8), seg_centers['segment_II']], 10)
    couinaud_meshes.append(generate_tube_mesh(
        seg2_pts, [0.24]*len(seg2_pts), 'Portal_vein_segment_II', 'portal_system',
        'Nhánh Cửa Hạ Phân Thùy II (Left Postero-lateral Superior)', couinaud_seg='segment_II', vessel_role='segmental_portal'
    ))

    # 4. Segment III (Left Anterior Lateral Inferior) Pedicle
    seg3_pts = interpolate_catmull_rom([left_umbilical_turn, (2.2, 118.8, 5.8), seg_centers['segment_III']], 10)
    couinaud_meshes.append(generate_tube_mesh(
        seg3_pts, [0.24]*len(seg3_pts), 'Portal_vein_segment_III', 'portal_system',
        'Nhánh Cửa Hạ Phân Thùy III (Left Antero-lateral Inferior)', couinaud_seg='segment_III', vessel_role='segmental_portal'
    ))

    # 5. Segment IV (Left Medial / Quadrate Lobe) Pedicle
    seg4_pts = interpolate_catmull_rom([left_umbilical_turn, (0.0, 118.8, 5.8), seg_centers['segment_IV']], 10)
    couinaud_meshes.append(generate_tube_mesh(
        seg4_pts, [0.26]*len(seg4_pts), 'Portal_vein_segment_IV', 'portal_system',
        'Nhánh Cửa Hạ Phân Thùy IV (Left Medial / Thùy Vuông)', couinaud_seg='segment_IV', vessel_role='segmental_portal'
    ))

    # 6. Right Anterior Division (supplies Segment V and Segment VIII)
    r_ant_div = (-5.5, 116.5, 4.2)
    r_post_div = (-5.5, 116.5, 1.2)

    seg5_pts = interpolate_catmull_rom([right_portal_trunk, r_ant_div, (-6.0, 115.5, 4.8), seg_centers['segment_V']], 10)
    couinaud_meshes.append(generate_tube_mesh(
        seg5_pts, [0.28]*len(seg5_pts), 'Portal_vein_segment_V', 'portal_system',
        'Nhánh Cửa Hạ Phân Thùy V (Right Antero-medial Inferior)', couinaud_seg='segment_V', vessel_role='segmental_portal'
    ))

    seg8_pts = interpolate_catmull_rom([right_portal_trunk, r_ant_div, (-6.0, 119.2, 3.8), seg_centers['segment_VIII']], 10)
    couinaud_meshes.append(generate_tube_mesh(
        seg8_pts, [0.28]*len(seg8_pts), 'Portal_vein_segment_VIII', 'portal_system',
        'Nhánh Cửa Hạ Phân Thùy VIII (Right Antero-medial Superior)', couinaud_seg='segment_VIII', vessel_role='segmental_portal'
    ))

    # 7. Right Posterior Division (supplies Segment VI and Segment VII)
    seg6_pts = interpolate_catmull_rom([right_portal_trunk, r_post_div, (-6.2, 114.8, 0.8), seg_centers['segment_VI']], 10)
    couinaud_meshes.append(generate_tube_mesh(
        seg6_pts, [0.28]*len(seg6_pts), 'Portal_vein_segment_VI', 'portal_system',
        'Nhánh Cửa Hạ Phân Thùy VI (Right Postero-lateral Inferior)', couinaud_seg='segment_VI', vessel_role='segmental_portal'
    ))

    seg7_pts = interpolate_catmull_rom([right_portal_trunk, r_post_div, (-6.2, 118.8, 0.2), seg_centers['segment_VII']], 10)
    couinaud_meshes.append(generate_tube_mesh(
        seg7_pts, [0.28]*len(seg7_pts), 'Portal_vein_segment_VII', 'portal_system',
        'Nhánh Cửa Hạ Phân Thùy VII (Right Postero-lateral Superior)', couinaud_seg='segment_VII', vessel_role='segmental_portal'
    ))

    # =========================================================================
    # C. ACCOMPANYING SEGMENTAL HEPATIC ARTERIES (Arteria Hepatica Propria)
    # =========================================================================
    pha_bif = (-2.1, 117.3, 4.8)
    art_r = (-4.0, 116.8, 4.2)
    art_l = (0.0, 117.5, 4.5)

    r_art_trunk = interpolate_catmull_rom([pha_bif, art_r], 6)
    couinaud_meshes.append(generate_tube_mesh(
        r_art_trunk, [0.18]*len(r_art_trunk), 'Right_hepatic_artery_trunk', 'hepatic_artery',
        'Động Mạch Gan Phải (Ramus Dexter Arteriae Hepaticae Propriae)', couinaud_seg=None, vessel_role='artery_branch'
    ))

    l_art_trunk = interpolate_catmull_rom([pha_bif, art_l], 6)
    couinaud_meshes.append(generate_tube_mesh(
        l_art_trunk, [0.18]*len(l_art_trunk), 'Left_hepatic_artery_trunk', 'hepatic_artery',
        'Động Mạch Gan Trái (Ramus Sinister Arteriae Hepaticae Propriae)', couinaud_seg=None, vessel_role='artery_branch'
    ))

    # Arterial branches parallel to portal segments with subtle offset
    art_offsets = {
        'segment_I':   (-0.15, -0.15, 0.15),
        'segment_II':  (0.12, -0.15, 0.12),
        'segment_III': (0.12, -0.15, 0.12),
        'segment_IV':  (-0.12, -0.15, 0.12),
        'segment_V':   (-0.15, -0.15, 0.12),
        'segment_VI':  (-0.15, -0.15, 0.12),
        'segment_VII': (-0.15, 0.15, -0.12),
        'segment_VIII':(-0.15, 0.15, 0.12)
    }

    portal_map = {
        'segment_I': seg1_pts, 'segment_II': seg2_pts, 'segment_III': seg3_pts, 'segment_IV': seg4_pts,
        'segment_V': seg5_pts, 'segment_VI': seg6_pts, 'segment_VII': seg7_pts, 'segment_VIII': seg8_pts
    }

    for seg_id, pts in portal_map.items():
        off = art_offsets[seg_id]
        art_pts = [(p[0]+off[0], p[1]+off[1], p[2]+off[2]) for p in pts]
        seg_num = seg_id.split('_')[1]
        couinaud_meshes.append(generate_tube_mesh(
            art_pts, [0.12]*len(art_pts), f'Hepatic_artery_{seg_id}', 'hepatic_artery',
            f'Động Mạch Cấp Máu Hạ Phân Thùy {seg_num} (Segmental Hepatic Artery {seg_num})',
            couinaud_seg=seg_id, vessel_role='segmental_artery'
        ))

    return couinaud_meshes

def build_complete_hepatic_and_mesenteric_vessels():
    print("[1/4] Mapping Startup.blend memory blocks...")
    addr_map = {}
    with open(BLEND_PATH, 'rb') as f:
        f.seek(12)
        while True:
            hdr_pos = f.tell()
            hdr = f.read(24)
            if len(hdr) < 24: break
            code, size, addr, sdna_idx, count = struct.unpack('<4sIQII', hdr)
            addr_map[addr] = (hdr_pos + 24, size, code, sdna_idx, count)
            f.seek(size, 1)

    print(f"      Mapped {len(addr_map)} blocks.")

    # 1. Read Object matrices
    ob_matrices = {}
    with open(BLEND_PATH, 'rb') as f:
        for addr, (pos, size, code, sdna, count) in addr_map.items():
            if code == b'OB\x00\x00':
                f.seek(pos)
                data = f.read(size)
                name = data[40:106].split(b'\x00')[0].decode('latin1', errors='ignore')
                for _, ob_name, _, _, _, _ in BLEND_VESSEL_SOURCES:
                    if name == ob_name:
                        if len(data) >= 796:
                            mat = struct.unpack('<16f', data[732:796])
                            ob_matrices[ob_name] = mat

    print(f"[2/4] Extracting vessel splines from Z-Anatomy master...")
    extracted_meshes = []

    with open(BLEND_PATH, 'rb') as f:
        for cu_name, ob_name, organ_id, display_name, def_radius, cat in BLEND_VESSEL_SOURCES:
            ob_mat = ob_matrices.get(ob_name)
            if not ob_mat:
                print(f"Warning: Matrix not found for {ob_name}")
                continue

            for addr, (pos, size, code, sdna, count) in addr_map.items():
                if code == b'CU\x00\x00':
                    f.seek(pos)
                    data = f.read(min(size, 120))
                    name = data[40:106].split(b'\x00')[0].decode('latin1', errors='ignore')
                    if name == cu_name:
                        f.seek(pos)
                        full_data = f.read(size)
                        first_nurb = struct.unpack('<Q', full_data[200:208])[0]
                        nurb_addr = first_nurb
                        spline_idx = 0

                        # Traverse all chained nurbs (splines) in this curve
                        while nurb_addr and nurb_addr in addr_map:
                            spline_idx += 1
                            npos, nsize, _, _, _ = addr_map[nurb_addr]
                            f.seek(npos)
                            ndata = f.read(nsize)
                            next_nurb = struct.unpack('<Q', ndata[:8])[0]
                            pntsu = struct.unpack('<i', ndata[24:28])[0]
                            bezt_ptr = struct.unpack('<Q', ndata[72:80])[0]

                            if bezt_ptr in addr_map:
                                bpos, bsize, _, _, bcount = addr_map[bezt_ptr]
                                f.seek(bpos)
                                bezt_data = f.read(bsize)

                                knots = []
                                count_triples = bsize // 72
                                for i in range(count_triples):
                                    kdata = bezt_data[i*72 : (i+1)*72]
                                    h1 = struct.unpack('<3f', kdata[0:12])
                                    co = struct.unpack('<3f', kdata[12:24])
                                    h2 = struct.unpack('<3f', kdata[24:36])
                                    r = struct.unpack('<f', kdata[44:48])[0]
                                    r_eff = def_radius if (r <= 0.0001 or r > 0.05) else r
                                    knots.append({'h1': h1, 'co': co, 'h2': h2, 'radius': r_eff})

                                if len(knots) >= 2:
                                    # Subdivide knots into smooth 3D tube path
                                    sampled_pts = []
                                    sampled_rad = []
                                    for k_i in range(len(knots) - 1):
                                        k0 = knots[k_i]
                                        k1 = knots[k_i+1]
                                        p0 = transform_point(k0['co'], ob_mat)
                                        p1 = transform_point(k0['h2'], ob_mat)
                                        p2 = transform_point(k1['h1'], ob_mat)
                                        p3 = transform_point(k1['co'], ob_mat)
                                        r0 = k0['radius'] * 100.0
                                        r1 = k1['radius'] * 100.0
                                        subdiv = 6
                                        for s in range(subdiv):
                                            t = s / subdiv
                                            t2 = t * t
                                            t3 = t2 * t
                                            omt = 1.0 - t
                                            omt2 = omt * omt
                                            omt3 = omt2 * omt
                                            bx = omt3*p0[0] + 3*omt2*t*p1[0] + 3*omt*t2*p2[0] + t3*p3[0]
                                            by = omt3*p0[1] + 3*omt2*t*p1[1] + 3*omt*t2*p2[1] + t3*p3[1]
                                            bz = omt3*p0[2] + 3*omt2*t*p1[2] + 3*omt*t2*p2[2] + t3*p3[2]
                                            sampled_pts.append((bx, by, bz))
                                            sampled_rad.append(r0*(1.0-t) + r1*t)
                                    sampled_pts.append(transform_point(knots[-1]['co'], ob_mat))
                                    sampled_rad.append(knots[-1]['radius'] * 100.0)

                                    sub_name = f"{cu_name[2:]}_spline_{spline_idx}" if spline_idx > 1 else cu_name[2:]
                                    sub_disp = f"{display_name} (Nhánh {spline_idx})" if spline_idx > 1 else display_name
                                    m_data = generate_tube_mesh(sampled_pts, sampled_rad, sub_name, organ_id, sub_disp, vessel_role=cat)
                                    if m_data:
                                        extracted_meshes.append(m_data)

                            nurb_addr = next_nurb

    print(f"      Extracted {len(extracted_meshes)} splines from Z-Anatomy master.")

    # 3. Build Couinaud 8-Segment Vascular Tree & 3 Hepatic Veins
    print("[3/4] Synthesizing Couinaud 8-Segmental Glissonian Triads & 3 Intersegmental Hepatic Veins...")
    couinaud_vessels = build_couinaud_vascular_tree()
    print(f"      Generated {len(couinaud_vessels)} Couinaud segmental & intersegmental vessels.")
    extracted_meshes.extend(couinaud_vessels)

    # 4. Pack into Binary GLB
    print(f"[4/4] Packing {len(extracted_meshes)} vessel meshes into {OUTPUT_GLB}...")
    glb_bytes = build_glb_binary(extracted_meshes)

    os.makedirs(os.path.dirname(OUTPUT_GLB), exist_ok=True)
    with open(OUTPUT_GLB, 'wb') as f:
        f.write(glb_bytes)

    mb = len(glb_bytes) / (1024 * 1024)
    print(f"Done! Successfully created {OUTPUT_GLB}")
    print(f"Total Meshes: {len(extracted_meshes)}, Size: {mb:.2f} MB")

def build_glb_binary(extracted_meshes):
    # Material palette
    # 0: Portal Blue (0x2563eb)
    # 1: Hepatic Artery Red (0xdc2626)
    # 2: Hepatic Veins Dark Blue (0x1d4ed8)
    # 3: IVC Cyan Blue (0x0284c7)
    materials = [
        {"name": "mat_portal_vein", "pbrMetallicRoughness": {"baseColorFactor": [0.145, 0.388, 0.921, 1.0], "metallicFactor": 0.18, "roughnessFactor": 0.35}},
        {"name": "mat_hepatic_artery", "pbrMetallicRoughness": {"baseColorFactor": [0.863, 0.149, 0.149, 1.0], "metallicFactor": 0.20, "roughnessFactor": 0.30}},
        {"name": "mat_hepatic_veins", "pbrMetallicRoughness": {"baseColorFactor": [0.114, 0.306, 0.847, 1.0], "metallicFactor": 0.18, "roughnessFactor": 0.32}},
        {"name": "mat_inferior_vena_cava", "pbrMetallicRoughness": {"baseColorFactor": [0.008, 0.518, 0.780, 1.0], "metallicFactor": 0.18, "roughnessFactor": 0.32}}
    ]

    bin_data = bytearray()
    buffer_views = []
    accessors = []
    meshes = []
    nodes = []

    for item in extracted_meshes:
        verts = item['vertices']
        norms = item['normals']
        uvs = item['uvs']
        indices = item['indices']

        v_min = [min(v[c] for v in verts) for c in range(3)]
        v_max = [max(v[c] for v in verts) for c in range(3)]

        # Align to 4 bytes
        def pad_4(ba):
            rem = len(ba) % 4
            if rem: ba.extend(b'\x00' * (4 - rem))

        # Position buffer
        pad_4(bin_data)
        pos_offset = len(bin_data)
        pos_bytes = struct.pack(f'<{len(verts)*3}f', *[coord for v in verts for coord in v])
        bin_data.extend(pos_bytes)
        pos_bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": pos_offset, "byteLength": len(pos_bytes), "target": 34962})
        pos_acc_idx = len(accessors)
        accessors.append({"bufferView": pos_bv_idx, "byteOffset": 0, "componentType": 5126, "count": len(verts), "type": "VEC3", "min": v_min, "max": v_max})

        # Normal buffer
        pad_4(bin_data)
        norm_offset = len(bin_data)
        norm_bytes = struct.pack(f'<{len(norms)*3}f', *[coord for n in norms for coord in n])
        bin_data.extend(norm_bytes)
        norm_bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": norm_offset, "byteLength": len(norm_bytes), "target": 34962})
        norm_acc_idx = len(accessors)
        accessors.append({"bufferView": norm_bv_idx, "byteOffset": 0, "componentType": 5126, "count": len(norms), "type": "VEC3"})

        # UV buffer
        pad_4(bin_data)
        uv_offset = len(bin_data)
        uv_bytes = struct.pack(f'<{len(uvs)*2}f', *[coord for u in uvs for coord in u])
        bin_data.extend(uv_bytes)
        uv_bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": uv_offset, "byteLength": len(uv_bytes), "target": 34962})
        uv_acc_idx = len(accessors)
        accessors.append({"bufferView": uv_bv_idx, "byteOffset": 0, "componentType": 5126, "count": len(uvs), "type": "VEC2"})

        # Index buffer (UNSIGNED_SHORT if < 65535 else UNSIGNED_INT)
        pad_4(bin_data)
        idx_offset = len(bin_data)
        if len(verts) < 65535:
            idx_bytes = struct.pack(f'<{len(indices)}H', *indices)
            c_type = 5123
        else:
            idx_bytes = struct.pack(f'<{len(indices)}I', *indices)
            c_type = 5125
        bin_data.extend(idx_bytes)
        idx_bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": idx_offset, "byteLength": len(idx_bytes), "target": 34963})
        idx_acc_idx = len(accessors)
        accessors.append({"bufferView": idx_bv_idx, "byteOffset": 0, "componentType": c_type, "count": len(indices), "type": "SCALAR"})

        # Material select
        org = item['organId']
        if org == 'portal_system': mat_idx = 0
        elif org == 'hepatic_artery': mat_idx = 1
        elif 'cava' in item['name'].lower(): mat_idx = 3
        else: mat_idx = 2

        mesh_idx = len(meshes)
        meshes.append({
            "name": item['name'],
            "primitives": [{
                "attributes": {
                    "POSITION": pos_acc_idx,
                    "NORMAL": norm_acc_idx,
                    "TEXCOORD_0": uv_acc_idx
                },
                "indices": idx_acc_idx,
                "material": mat_idx
            }]
        })

        node_data = {
            "name": item['name'],
            "mesh": mesh_idx,
            "extras": {
                "organId": item['organId'],
                "displayName": item['displayName'],
                "couinaudSeg": item.get('couinaudSeg'),
                "vesselRole": item.get('vesselRole')
            }
        }
        nodes.append(node_data)

    pad_4(bin_data)

    gltf_dict = {
        "asset": {"version": "2.0", "generator": "ZAnatomy-Couinaud-Vascular-Builder"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_data)}]
    }

    json_str = json.dumps(gltf_dict, separators=(',', ':'))
    json_bytes = json_str.encode('utf-8')
    rem = len(json_bytes) % 4
    if rem: json_bytes += b' ' * (4 - rem)

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_data)
    glb = bytearray()
    glb.extend(struct.pack('<III', 0x46546C67, 2, total_len))
    glb.extend(struct.pack('<II', len(json_bytes), 0x4E4F534A))
    glb.extend(json_bytes)
    glb.extend(struct.pack('<II', len(bin_data), 0x004E4942))
    glb.extend(bin_data)

    return glb

if __name__ == "__main__":
    build_complete_hepatic_and_mesenteric_vessels()
