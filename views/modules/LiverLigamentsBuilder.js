import * as THREE from 'three';

/**
 * LiverLigamentsBuilder
 * 
 * Synthesizes anatomically accurate 3D procedural meshes for the peritoneal ligaments of the human liver:
 * 1. Falciform Ligament (Dây chằng liềm / Ligamentum falciforme hepatis):
 *    Double-layered glistening peritoneal crescent fold along the umbilical / interlobar groove
 *    between the Left Lobe (Segments II & III) and Segment IV (Thùy vuông).
 * 2. Round Ligament of the Liver (Dây chằng tròn gan / Ligamentum teres hepatis):
 *    Dense cylindrical fibrous cord (obliterated umbilical vein) running in the free inferior margin
 *    and into the umbilical fissure toward the left portal vein.
 * 3. Coronary Ligament - Superior & Inferior Leaves (Dây chằng vành / Ligamentum coronarium):
 *    Peritoneal reflections bounding the Bare Area of the liver (Vùng trần / Area nuda hepatis).
 * 4. Right & Left Triangular Ligaments (Dây chằng tam giác phải & trái / Ligamentum triangulare dextrum et sinistrum).
 * 5. Ligamentum Venosum (Dây chằng tĩnh mạch):
 *    Fibrous cord remnant of ductus venosus in the fissure for ligamentum venosum.
 */
export class LiverLigamentsBuilder {
  constructor() {
    this.ligamentMeshes = [];
    this.isVisible = true;
  }

  /**
   * Constructs procedural 3D meshes for all liver ligaments and adds them to parentGroup.
   * @param {THREE.Object3D} parentGroup - The scene or GLTF root container
   * @param {Array<THREE.Mesh>} clickableMeshes - Array to register meshes for raycasting & hover callouts
   * @param {Array<THREE.Mesh>} allVisceralMeshes - Array for scene-level visibility management
   * @returns {Array<THREE.Mesh>} Created ligament meshes
   */
  buildLigaments(parentGroup, clickableMeshes = [], allVisceralMeshes = []) {
    this.ligamentMeshes = [];

    // Common PBR Materials
    const falciformMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x0f172a,
      emissiveIntensity: 0.08,
      roughness: 0.20,
      metalness: 0.05,
      transparent: true,
      opacity: 0.70,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const coronaryMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      emissive: 0x0f172a,
      emissiveIntensity: 0.08,
      roughness: 0.22,
      metalness: 0.05,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const roundLigMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0x713f12,
      emissiveIntensity: 0.15,
      roughness: 0.38,
      metalness: 0.08,
      side: THREE.DoubleSide
    });

    const venosumMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x1e293b,
      emissiveIntensity: 0.12,
      roughness: 0.35,
      metalness: 0.06,
      side: THREE.DoubleSide
    });

    // =========================================================================
    // 1. DÂY CHẰNG LIỀM (Falciform Ligament / Ligamentum Falciforme Hepatis)
    // Runs in the true anatomical interlobar groove between the Left Lobe (Segments II & III)
    // and Segment IV (Thùy vuông), from the umbilical notch up to the superior coronary leaf.
    // =========================================================================
    // Measured surface coordinates along the interlobar fissure + normal offset to prevent clipping
    const visceralP = [
      new THREE.Vector3(-0.09, 116.08, 9.13),
      new THREE.Vector3(-0.32, 117.02, 9.42),
      new THREE.Vector3(-0.24, 118.01, 9.60),
      new THREE.Vector3(-0.05, 119.01, 9.77),
      new THREE.Vector3( 0.01, 120.30, 9.92),
      new THREE.Vector3(-0.14, 121.10, 9.93),
      new THREE.Vector3( 0.05, 121.93, 9.82),
      new THREE.Vector3( 0.23, 122.63, 9.58),
      new THREE.Vector3( 0.29, 123.70, 8.60),
      new THREE.Vector3( 0.51, 124.22, 7.61),
      new THREE.Vector3( 0.35, 124.66, 5.57)
    ];

    // Parietal reflection extending toward anterior abdominal wall (kept safely inside torso envelope)
    const parietalA = [
      new THREE.Vector3(-0.09, 114.60, 9.65),
      new THREE.Vector3(-0.28, 116.20, 10.10),
      new THREE.Vector3(-0.22, 117.50, 10.35),
      new THREE.Vector3(-0.05, 118.80, 10.52),
      new THREE.Vector3( 0.01, 120.20, 10.65),
      new THREE.Vector3(-0.12, 121.15, 10.65),
      new THREE.Vector3( 0.06, 122.05, 10.50),
      new THREE.Vector3( 0.24, 122.85, 10.20),
      new THREE.Vector3( 0.30, 123.95, 9.15),
      new THREE.Vector3( 0.48, 124.55, 8.05),
      new THREE.Vector3( 0.35, 125.00, 5.82)
    ];

    const curveV = new THREE.CatmullRomCurve3(visceralP);
    const curveA = new THREE.CatmullRomCurve3(parietalA);
    const numSteps = 32;
    const ptsV = curveV.getPoints(numSteps);
    const ptsA = curveA.getPoints(numSteps);

    const falciformGeom = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];
    const uvs = [];

    for (let i = 0; i <= numSteps; i++) {
      const v = ptsV[i];
      const a = ptsA[i];
      positions.push(v.x, v.y, v.z);
      positions.push(a.x, a.y, a.z);
      const u = i / numSteps;
      uvs.push(u, 0.0);
      uvs.push(u, 1.0);
    }

    for (let i = 0; i < numSteps; i++) {
      const v0 = 2 * i;
      const a0 = 2 * i + 1;
      const v1 = 2 * (i + 1);
      const a1 = 2 * (i + 1) + 1;
      indices.push(v0, v1, a1);
      indices.push(v0, a1, a0);
    }

    falciformGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    falciformGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    falciformGeom.setIndex(indices);
    falciformGeom.computeVertexNormals();

    const falciformMesh = new THREE.Mesh(falciformGeom, falciformMat);
    falciformMesh.name = 'falciform_ligament';
    falciformMesh.castShadow = true;
    falciformMesh.receiveShadow = true;
    falciformMesh.userData = {
      organId: 'liver',
      subPartId: 'falciform_ligament',
      isLigament: true,
      vietnameseName: 'Dây Chằng Liềm',
      latinName: 'Ligamentum Falciforme Hepatis',
      englishName: 'Falciform Ligament of Liver',
      description: 'Nếp phúc mạc hình lưỡi liềm bám từ rãnh liên thùy mặt trước-trên của gan lên cơ hoành và thành bụng trước, phân chia hình thể ngoài gan thành thùy phải và thùy trái.',
      clinicalNotes: 'Trong phẫu thuật nội soi ổ bụng, dây chằng liềm là mốc định vị đường giữa và là ranh giới phân tách thùy gan trái (HPT IV) khỏi thùy gan phải.',
      initialPos: falciformMesh.position.clone(),
      initialScale: falciformMesh.scale.clone(),
      couinaudAnchor: 'segment_IV'
    };
    parentGroup.add(falciformMesh);
    this.ligamentMeshes.push(falciformMesh);

    // =========================================================================
    // 2. DÂY CHẰNG TRÒN GAN (Round Ligament / Ligamentum Teres Hepatis)
    // Dense fibrous cord in the free inferior margin of falciform ligament,
    // running from the umbilical fissure / notch toward the umbilicus, and posteriorly
    // connecting to the left portal vein in the fissure for ligamentum teres.
    // =========================================================================
    const roundLigPoints = [
      new THREE.Vector3(-0.38, 117.37, 3.72),   // Rốn gan / Nhánh trái Tĩnh mạch cửa
      new THREE.Vector3(-0.57, 116.87, 5.87),
      new THREE.Vector3(-0.58, 116.69, 7.11),   // Rãnh dây chằng tròn mặt tạng
      new THREE.Vector3(-0.49, 115.94, 8.26),
      new THREE.Vector3(-0.56, 115.44, 8.88),   // Khuyết dây chằng tròn bờ dưới gan
      new THREE.Vector3(-0.09, 115.85, 9.13),   // Khuyết liên thùy
      new THREE.Vector3(-0.09, 114.60, 9.65),   // Bờ dưới tự do của dây chằng liềm
      new THREE.Vector3(-0.05, 112.80, 9.85),
      new THREE.Vector3( 0.00, 111.00, 9.95)    // Đoạn tự do hướng rốn (gọn trong thành bụng)
    ];
    const roundLigCurve = new THREE.CatmullRomCurve3(roundLigPoints);
    const roundLigGeom = new THREE.TubeGeometry(roundLigCurve, 48, 0.13, 12, false);
    const roundLigMesh = new THREE.Mesh(roundLigGeom, roundLigMat);
    roundLigMesh.name = 'round_ligament';
    roundLigMesh.castShadow = true;
    roundLigMesh.userData = {
      organId: 'liver',
      subPartId: 'round_ligament',
      isLigament: true,
      vietnameseName: 'Dây Chằng Tròn Gan',
      latinName: 'Ligamentum Teres Hepatis',
      englishName: 'Round Ligament of Liver',
      description: 'Dải thừng xơ đặc (di tích thoái hóa của tĩnh mạch rốn thời kỳ phôi thai) chạy ở bờ dưới tự do của dây chằng liềm từ rốn tới rãnh rốn gan.',
      clinicalNotes: 'Trong tăng áp lực tĩnh mạch cửa (xơ gan), tĩnh mạch rốn trong dây chằng tròn có thể tái thông máu (recanalization) tạo tuần hoàn bàng hệ kiểu đầu sứa (Caput Medusae).',
      initialPos: roundLigMesh.position.clone(),
      initialScale: roundLigMesh.scale.clone(),
      couinaudAnchor: 'segment_IV'
    };
    parentGroup.add(roundLigMesh);
    this.ligamentMeshes.push(roundLigMesh);

    // =========================================================================
    // 3. DÂY CHẰNG VÀNH - LÁ TRÊN (Coronary Ligament - Superior Leaf)
    // Sits atop the superior crest of the liver with smooth normal offset (+Y)
    // bounding the superior border of the Bare Area.
    // =========================================================================
    const supLeafInner = [
      new THREE.Vector3(-10.28, 123.14, 2.60),
      new THREE.Vector3( -9.10, 124.35, 1.50),
      new THREE.Vector3( -7.80, 125.10, 1.80),
      new THREE.Vector3( -6.20, 125.55, 2.20),
      new THREE.Vector3( -4.80, 125.60, 3.20),
      new THREE.Vector3( -2.70, 125.25, 4.90),
      new THREE.Vector3(  0.35, 124.66, 5.57), // Điểm gặp Dây chằng liềm
      new THREE.Vector3(  3.00, 124.60, 4.95),
      new THREE.Vector3(  5.20, 124.30, 4.10),
      new THREE.Vector3(  7.15, 123.45, 3.85),
      new THREE.Vector3(  8.43, 122.63, 3.41)  // Đỉnh thùy trái gan
    ];

    const supLeafOuter = supLeafInner.map(pt => new THREE.Vector3(pt.x, pt.y + 0.34, pt.z + 0.25));
    const supCurveI = new THREE.CatmullRomCurve3(supLeafInner);
    const supCurveO = new THREE.CatmullRomCurve3(supLeafOuter);
    const supSteps = 32;
    const ptsSI = supCurveI.getPoints(supSteps);
    const ptsSO = supCurveO.getPoints(supSteps);

    const supGeom = new THREE.BufferGeometry();
    const supPositions = [];
    const supIndices = [];
    for (let i = 0; i <= supSteps; i++) {
      supPositions.push(ptsSI[i].x, ptsSI[i].y, ptsSI[i].z);
      supPositions.push(ptsSO[i].x, ptsSO[i].y, ptsSO[i].z);
    }
    for (let i = 0; i < supSteps; i++) {
      const v0 = 2 * i;
      const o0 = 2 * i + 1;
      const v1 = 2 * (i + 1);
      const o1 = 2 * (i + 1) + 1;
      supIndices.push(v0, v1, o1);
      supIndices.push(v0, o1, o0);
    }
    supGeom.setAttribute('position', new THREE.Float32BufferAttribute(supPositions, 3));
    supGeom.setIndex(supIndices);
    supGeom.computeVertexNormals();

    const supCoronaryMesh = new THREE.Mesh(supGeom, coronaryMat);
    supCoronaryMesh.name = 'coronary_ligament_superior';
    supCoronaryMesh.userData = {
      organId: 'liver',
      subPartId: 'coronary_ligament_superior',
      isLigament: true,
      vietnameseName: 'Dây Chằng Vành (Lá Trên)',
      latinName: 'Ligamentum Coronarium (Lamina Superior)',
      englishName: 'Coronary Ligament (Superior Layer)',
      description: 'Lá phúc mạc từ mặt hoành của gan lật lên mặt dưới cơ hoành, giới hạn bờ trên của vùng trần của gan.',
      clinicalNotes: 'Phẫu thuật cắt gan phải hoặc giải phóng gan cần cắt lá trên dây chằng vành để bộc lộ tĩnh mạch chủ dưới và các tĩnh mạch gan.',
      initialPos: supCoronaryMesh.position.clone(),
      initialScale: supCoronaryMesh.scale.clone(),
      couinaudAnchor: 'segment_VIII'
    };
    parentGroup.add(supCoronaryMesh);
    this.ligamentMeshes.push(supCoronaryMesh);

    // =========================================================================
    // 4. DÂY CHẰNG VÀNH - LÁ DƯỚI (Coronary Ligament - Inferior Leaf)
    // Sits at the posterior inferior border of the Bare Area, offset smoothly outward (-Z, -Y).
    // =========================================================================
    const infLeafInner = [
      new THREE.Vector3(-10.34, 119.90, -2.49),
      new THREE.Vector3( -9.36, 118.80, -3.96),
      new THREE.Vector3( -8.37, 117.25, -4.79),
      new THREE.Vector3( -7.43, 117.34, -5.25),
      new THREE.Vector3( -6.40, 118.28, -5.37),
      new THREE.Vector3( -5.85, 118.36, -5.30),
      new THREE.Vector3( -4.43, 119.70, -4.57),
      new THREE.Vector3( -3.41, 120.41, -3.50),
      new THREE.Vector3( -2.44, 120.56, -1.48)
    ];
    const infLeafOuter = infLeafInner.map(pt => new THREE.Vector3(pt.x, pt.y - 0.32, pt.z - 0.32));
    const infCurveI = new THREE.CatmullRomCurve3(infLeafInner);
    const infCurveO = new THREE.CatmullRomCurve3(infLeafOuter);
    const infSteps = 24;
    const ptsII = infCurveI.getPoints(infSteps);
    const ptsIO = infCurveO.getPoints(infSteps);

    const infGeom = new THREE.BufferGeometry();
    const infPositions = [];
    const infIndices = [];
    for (let i = 0; i <= infSteps; i++) {
      infPositions.push(ptsII[i].x, ptsII[i].y, ptsII[i].z);
      infPositions.push(ptsIO[i].x, ptsIO[i].y, ptsIO[i].z);
    }
    for (let i = 0; i < infSteps; i++) {
      const v0 = 2 * i;
      const o0 = 2 * i + 1;
      const v1 = 2 * (i + 1);
      const o1 = 2 * (i + 1) + 1;
      infIndices.push(v0, v1, o1);
      infIndices.push(v0, o1, o0);
    }
    infGeom.setAttribute('position', new THREE.Float32BufferAttribute(infPositions, 3));
    infGeom.setIndex(infIndices);
    infGeom.computeVertexNormals();

    const infCoronaryMesh = new THREE.Mesh(infGeom, coronaryMat);
    infCoronaryMesh.name = 'coronary_ligament_inferior';
    infCoronaryMesh.userData = {
      organId: 'liver',
      subPartId: 'coronary_ligament_inferior',
      isLigament: true,
      vietnameseName: 'Dây Chằng Vành (Lá Dưới)',
      latinName: 'Ligamentum Coronarium (Lamina Inferior)',
      englishName: 'Coronary Ligament (Inferior Layer)',
      description: 'Lá phúc mạc lật ở mặt sau tạng của gan lên cơ hoành, giới hạn bờ dưới của vùng trần (Bare area of liver).',
      clinicalNotes: 'Giới hạn ranh giới khoang dưới hoành và khoang Morison (ngách gan-thận).',
      initialPos: infCoronaryMesh.position.clone(),
      initialScale: infCoronaryMesh.scale.clone(),
      couinaudAnchor: 'segment_VII'
    };
    parentGroup.add(infCoronaryMesh);
    this.ligamentMeshes.push(infCoronaryMesh);

    // =========================================================================
    // 5. DÂY CHẰNG TAM GIÁC TRÁI (Left Triangular Ligament)
    // Slender peritoneal triangle continuing smoothly from the left tip of superior leaf.
    // =========================================================================
    const leftTriGeom = new THREE.BufferGeometry();
    const lPos = [
      8.43, 122.63, 3.41,  // Đỉnh bám đầu trái gan (khớp lá trên)
      9.28, 122.55, 3.85,  // Đỉnh nhọn ngoài vươn ra cơ hoành
      7.15, 123.45, 3.85   // Gốc liên tiếp lá trên
    ];
    leftTriGeom.setAttribute('position', new THREE.Float32BufferAttribute(lPos, 3));
    leftTriGeom.setIndex([0, 1, 2]);
    leftTriGeom.computeVertexNormals();
    const leftTriMesh = new THREE.Mesh(leftTriGeom, coronaryMat);
    leftTriMesh.name = 'left_triangular_ligament';
    leftTriMesh.userData = {
      organId: 'liver',
      subPartId: 'left_triangular_ligament',
      isLigament: true,
      vietnameseName: 'Dây Chằng Tam Giác Trái',
      latinName: 'Ligamentum Triangulare Sinistrum',
      englishName: 'Left Triangular Ligament of Liver',
      description: 'Nếp phúc mạc hình tam giác nối góc ngoài thùy trái của gan vào mặt dưới vòm hoành trái.',
      clinicalNotes: 'Cắt dây chằng tam giác trái là thì đầu tiên bắt buộc trong phẫu thuật cắt thùy gan trái hoặc phẫu tích thực quản bụng.',
      initialPos: leftTriMesh.position.clone(),
      initialScale: leftTriMesh.scale.clone(),
      couinaudAnchor: 'segment_II'
    };
    parentGroup.add(leftTriMesh);
    this.ligamentMeshes.push(leftTriMesh);

    // =========================================================================
    // 6. DÂY CHẰNG TAM GIÁC PHẢI (Right Triangular Ligament)
    // Lateral apex of the bare area where superior and inferior leaves converge.
    // =========================================================================
    const rightTriGeom = new THREE.BufferGeometry();
    const rPos = [
      -10.28, 123.14,  2.60,  // Gặp lá trên
      -11.20, 120.90,  0.25,  // Đỉnh nhọn bám cơ hoành (cùng rìa phải gan)
      -10.34, 119.90, -2.49   // Gặp lá dưới
    ];
    rightTriGeom.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    rightTriGeom.setIndex([0, 1, 2]);
    rightTriGeom.computeVertexNormals();
    const rightTriMesh = new THREE.Mesh(rightTriGeom, coronaryMat);
    rightTriMesh.name = 'right_triangular_ligament';
    rightTriMesh.userData = {
      organId: 'liver',
      subPartId: 'right_triangular_ligament',
      isLigament: true,
      vietnameseName: 'Dây Chằng Tam Giác Phải',
      latinName: 'Ligamentum Triangulare Dextrum',
      englishName: 'Right Triangular Ligament of Liver',
      description: 'Nếp phúc mạc nhỏ ở đầu bên phải của vùng trần, nơi 2 lá của dây chằng vành gặp nhau.',
      clinicalNotes: 'Cần giải phóng khi hạ gan phải trong phẫu thuật cắt gan lớn.',
      initialPos: rightTriMesh.position.clone(),
      initialScale: rightTriMesh.scale.clone(),
      couinaudAnchor: 'segment_VII'
    };
    parentGroup.add(rightTriMesh);
    this.ligamentMeshes.push(rightTriMesh);

    // =========================================================================
    // 7. DÂY CHẰNG TĨNH MẠCH (Ligamentum Venosum)
    // Fibrous cord in the posterior fissure for ligamentum venosum between Caudate lobe (I) and Left lobe (II).
    // =========================================================================
    const venosumPoints = [
      new THREE.Vector3( 0.35, 117.80, 3.80),  // Rốn gan (nhánh trái TMC)
      new THREE.Vector3( 0.15, 119.50, 2.50),
      new THREE.Vector3(-0.10, 121.50, 1.60),
      new THREE.Vector3(-0.40, 123.50, 0.80)   // Đổ vào Tĩnh mạch chủ dưới (IVC)
    ];
    const venosumCurve = new THREE.CatmullRomCurve3(venosumPoints);
    const venosumGeom = new THREE.TubeGeometry(venosumCurve, 32, 0.10, 10, false);
    const venosumMesh = new THREE.Mesh(venosumGeom, venosumMat);
    venosumMesh.name = 'ligamentum_venosum';
    venosumMesh.castShadow = true;
    venosumMesh.userData = {
      organId: 'liver',
      subPartId: 'ligamentum_venosum',
      isLigament: true,
      vietnameseName: 'Dây Chằng Tĩnh Mạch (Ống Arantius)',
      latinName: 'Ligamentum Venosum',
      englishName: 'Ligamentum Venosum',
      description: 'Dải sợi xơ nằm trong khe dây chằng tĩnh mạch ở mặt sau gan, là di tích thoái hóa của ống tĩnh mạch Arantius thời kỳ phôi thai.',
      clinicalNotes: 'Là ranh giới phân cách Thùy đuôi (HPT I) ở bên phải với Thùy gan trái (HPT II) ở bên trái.',
      initialPos: venosumMesh.position.clone(),
      initialScale: venosumMesh.scale.clone(),
      couinaudAnchor: 'segment_I'
    };
    parentGroup.add(venosumMesh);
    this.ligamentMeshes.push(venosumMesh);

    // Register into clickableMeshes & allVisceralMeshes
    this.ligamentMeshes.forEach(mesh => {
      clickableMeshes.push(mesh);
      allVisceralMeshes.push(mesh);
    });

    console.log(`[LiverLigamentsBuilder] Đã dựng thành công 7 dây chằng gan 3D chính thống (tọa độ rãnh liên thùy chuẩn xác).`);
    return this.ligamentMeshes;
  }

  /**
   * Sets visibility of all liver ligaments
   * @param {boolean} visible 
   */
  setVisibility(visible) {
    this.isVisible = visible;
    this.ligamentMeshes.forEach(m => {
      m.visible = visible;
    });
  }
}
