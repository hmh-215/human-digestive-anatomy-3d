import * as THREE from 'three';

/**
 * LiverLigamentsBuilder
 * 
 * Synthesizes anatomically accurate 3D procedural meshes for the peritoneal ligaments of the human liver:
 * 1. Falciform Ligament (Dây chằng liềm / Ligamentum falciforme hepatis):
 *    Double-layered glistening peritoneal crescent fold along the umbilical / interlobar groove.
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
      color: 0xf1f5f9,
      emissive: 0x0f172a,
      emissiveIntensity: 0.1,
      roughness: 0.22,
      metalness: 0.05,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: true
    });

    const coronaryMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x0f172a,
      emissiveIntensity: 0.1,
      roughness: 0.26,
      metalness: 0.05,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: true
    });

    const roundLigMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0x422006,
      emissiveIntensity: 0.15,
      roughness: 0.42,
      metalness: 0.06,
      side: THREE.DoubleSide
    });

    const venosumMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x1e293b,
      emissiveIntensity: 0.12,
      roughness: 0.38,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // =========================================================================
    // 1. DÂY CHẰNG LIỀM (Falciform Ligament / Ligamentum Falciforme Hepatis)
    // =========================================================================
    const visceralP = [
      new THREE.Vector3(-2.78, 113.23, 8.81),
      new THREE.Vector3(-2.74, 113.83, 9.04),
      new THREE.Vector3(-2.77, 116.16, 9.40),
      new THREE.Vector3(-2.87, 117.96, 9.64),
      new THREE.Vector3(-2.94, 120.07, 9.83),
      new THREE.Vector3(-2.91, 122.14, 9.68),
      new THREE.Vector3(-2.68, 124.01, 8.65),
      new THREE.Vector3(-2.81, 125.13, 6.59)
    ];

    const parietalA = [
      new THREE.Vector3(-2.50, 112.20, 10.40),
      new THREE.Vector3(-2.55, 113.40, 10.75),
      new THREE.Vector3(-2.60, 115.80, 11.20),
      new THREE.Vector3(-2.70, 118.00, 11.50),
      new THREE.Vector3(-2.75, 120.20, 11.60),
      new THREE.Vector3(-2.70, 122.40, 11.35),
      new THREE.Vector3(-2.55, 124.30, 10.15),
      new THREE.Vector3(-2.81, 125.70, 7.50)
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
      description: 'Nếp phúc mạc hình lưỡi liềm bám từ mặt trước-trên của gan lên cơ hoành và thành bụng trước, phân chia hình thể ngoài gan thành thùy phải và thùy trái.',
      clinicalNotes: 'Trong phẫu thuật nội soi ổ bụng, dây chằng liềm là mốc định vị đường giữa và là ranh giới phân tách thùy gan trái (HPT IV) khỏi thùy gan phải.',
      initialPos: falciformMesh.position.clone(),
      initialScale: falciformMesh.scale.clone(),
      couinaudAnchor: 'segment_IV'
    };
    parentGroup.add(falciformMesh);
    this.ligamentMeshes.push(falciformMesh);

    // =========================================================================
    // 2. DÂY CHẰNG TRÒN GAN (Round Ligament / Ligamentum Teres Hepatis)
    // =========================================================================
    const roundLigPoints = [
      new THREE.Vector3(-2.56, 116.95, 3.08),  // Rốn gan / Nhánh trái TMC
      new THREE.Vector3(-2.55, 117.15, 4.00),
      new THREE.Vector3(-2.56, 116.19, 5.49),
      new THREE.Vector3(-2.69, 115.50, 6.96),  // Rãnh dây chằng tròn ở mặt tạng
      new THREE.Vector3(-2.78, 113.23, 8.81),  // Khuyết dây chằng tròn ở bờ dưới gan
      new THREE.Vector3(-2.50, 111.50, 10.20), // Chạy trong bờ dưới tự do của dây chằng liềm
      new THREE.Vector3(-2.10, 109.00, 11.20),
      new THREE.Vector3(-1.60, 106.50, 12.00)  // Hướng về rốn (Umbilicus)
    ];
    const roundLigCurve = new THREE.CatmullRomCurve3(roundLigPoints);
    const roundLigGeom = new THREE.TubeGeometry(roundLigCurve, 48, 0.15, 12, false);
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
    // =========================================================================
    const supLeafInner = [
      new THREE.Vector3(-9.93, 123.86, 0.61),
      new THREE.Vector3(-7.59, 125.41, 1.02),
      new THREE.Vector3(-5.43, 125.77, 2.64),
      new THREE.Vector3(-3.38, 125.50, 3.77),
      new THREE.Vector3(-0.53, 124.81, 4.84),
      new THREE.Vector3(2.94, 124.67, 5.01),
      new THREE.Vector3(5.52, 124.31, 3.88),
      new THREE.Vector3(8.11, 122.88, 3.61)
    ];

    const supLeafOuter = supLeafInner.map(pt => new THREE.Vector3(pt.x, pt.y + 0.55, pt.z + 0.45));
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
    // =========================================================================
    const infLeafInner = [
      new THREE.Vector3(-9.56, 115.08, -3.13),
      new THREE.Vector3(-7.90, 115.31, -4.86),
      new THREE.Vector3(-5.74, 115.02, -2.15),
      new THREE.Vector3(-4.06, 115.54, 0.57)
    ];
    const infLeafOuter = infLeafInner.map(pt => new THREE.Vector3(pt.x, pt.y - 0.50, pt.z - 0.55));
    const infCurveI = new THREE.CatmullRomCurve3(infLeafInner);
    const infCurveO = new THREE.CatmullRomCurve3(infLeafOuter);
    const infSteps = 20;
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
    // =========================================================================
    const leftTriGeom = new THREE.BufferGeometry();
    const lPos = [
      8.11, 122.88, 3.61,  // Đỉnh bám đầu trái gan
      9.60, 124.20, 2.80,  // Đỉnh vươn ra cơ hoành
      6.80, 123.60, 3.80   // Gốc liên tiếp lá trên
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
    // =========================================================================
    const rightTriGeom = new THREE.BufferGeometry();
    const rPos = [
      -9.93, 123.86, 0.61,  // Gặp lá trên
      -10.80, 121.50, -1.20, // Đỉnh nhọn bám cơ hoành
      -9.56, 115.08, -3.13  // Gặp lá dưới
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
    // =========================================================================
    const venosumPoints = [
      new THREE.Vector3(-2.56, 116.95, 3.08),  // Rốn gan (nhánh trái TMC)
      new THREE.Vector3(-2.25, 118.80, 2.20),
      new THREE.Vector3(-2.00, 121.20, 1.30),
      new THREE.Vector3(-1.80, 123.50, 0.50)   // Đổ vào Tĩnh mạch chủ dưới (IVC)
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

    console.log(`[LiverLigamentsBuilder] Đã dựng thành công 7 dây chằng gan 3D chính thống.`);
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
