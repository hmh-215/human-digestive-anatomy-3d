import * as THREE from 'three';

/**
 * StomachLayersBuilder.js
 * Module 2: Builds the 6 concentric histological layers of the Stomach Wall
 * (Serosa, Longitudinal Muscle, Circular Muscle, Oblique Muscle, Submucosa, Mucosa Rugae)
 * and manages both:
 *   1. Stepped Cutaway Window (Cắt mở lòng bậc thang) when assembled
 *   2. Curved Anterior Cutaway Shells (Tách dạng mảnh vỏ cong) when exploded
 */
export class StomachLayersBuilder {
  constructor(proceduralTextures) {
    this.proceduralTextures = proceduralTextures;
    this.stomachWallMeshes = [];
    this.baseCenterWorld = new THREE.Vector3(0.688, 0.339, 0.206);
  }

  /**
   * Builds 6 concentric meshes from the base Stomach mesh.
   * @param {THREE.Mesh} stomachMesh
   * @param {Array} organsData
   * @returns {Array<THREE.Mesh>} The 6 created layer meshes
   */
  createLayers(stomachMesh, organsData) {
    this.stomachWallMeshes = [];
    const origGeo = stomachMesh.geometry;
    if (!origGeo.attributes.normal) {
      origGeo.computeVertexNormals();
    }
    origGeo.computeBoundingSphere();
    origGeo.computeBoundingBox();

    const radius = (origGeo.boundingSphere && origGeo.boundingSphere.radius)
      ? origGeo.boundingSphere.radius
      : 8.1;

    const localCenter = new THREE.Vector3();
    if (origGeo.boundingBox) {
      origGeo.boundingBox.getCenter(localCenter);

      // Generate clean, anatomically aligned UV coordinates across the J-shaped stomach
      // so procedural muscle fibers (Longitudinal, Circular, Oblique), Submucosa vessels,
      // and Mucosa Rugae folds tile crisply without global-atlas stretching.
      const bbox = origGeo.boundingBox;
      const sizeX = Math.max(0.001, bbox.max.x - bbox.min.x);
      const sizeY = Math.max(0.001, bbox.max.y - bbox.min.y);
      const sizeZ = Math.max(0.001, bbox.max.z - bbox.min.z);
      const posAttrBase = origGeo.attributes.position;
      const uvArray = new Float32Array(posAttrBase.count * 2);
      for (let i = 0; i < posAttrBase.count; i++) {
        const nx = (posAttrBase.getX(i) - bbox.min.x) / sizeX;
        const ny = (posAttrBase.getY(i) - bbox.min.y) / sizeY;
        const nz = (posAttrBase.getZ(i) - bbox.min.z) / sizeZ;
        uvArray[i * 2] = nx * 1.8 + nz * 0.7;
        uvArray[i * 2 + 1] = ny * 2.0;
      }
      origGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    }

    const organData = (organsData || []).find(o => o.id === 'stomach');
    const wallLayersDef = (organData && organData.wallLayers) || [
      { id: 'stomach_serosa', name: 'Lớp 1: Thanh Mạc (Tunica Serosa)', layerOrder: 1, color: '#e11d48', thickness: '0.5 - 0.8 mm', description: 'Lá tạng phúc mạc trơn láng bao bọc mặt ngoài dạ dày.' },
      { id: 'stomach_muscle_longitudinal', name: 'Lớp 2A: Thớ Cơ Dọc (Stratum Longitudinale)', layerOrder: 2, color: '#be123c', thickness: '0.8 - 1.2 mm', description: 'Các bó sợi cơ trơn chạy dọc theo bờ cong lớn và bờ cong nhỏ.' },
      { id: 'stomach_muscle_circular', name: 'Lớp 2B: Thớ Cơ Vòng (Stratum Circulare)', layerOrder: 3, color: '#991b1b', thickness: '1.5 - 2.5 mm', description: 'Lớp cơ chạy vòng quanh chu vi thân vị, dày lên tạo cơ thắt môn vị.' },
      { id: 'stomach_muscle_oblique', name: 'Lớp 2C: Thớ Cơ Chéo (Fibrae Obliquae)', layerOrder: 4, color: '#7f1d1d', thickness: '0.6 - 1.0 mm', description: 'Thớ cơ đan chéo góc 45° đặc trưng riêng của dạ dày giúp nhào trộn thức ăn.' },
      { id: 'stomach_submucosa', name: 'Lớp 3: Tầng Dưới Niêm Mạc (Tela Submucosa)', layerOrder: 5, color: '#f472b6', thickness: '2.0 - 3.5 mm', description: 'Mô liên kết giàu mạch máu và đám rối thần kinh Meissner.' },
      { id: 'stomach_mucosa', name: 'Lớp 4: Lớp Niêm Mạc Tuyến (Tunica Mucosa & Rugae)', layerOrder: 6, color: '#ea580c', thickness: '1.5 - 2.5 mm', description: 'Lớp trong cùng với các nếp gấp vị (Rugae) uốn lượn và tuyến tiết dịch vị.' }
    ];

    const insets = [
      0.0,
      0.012 * radius,
      0.024 * radius,
      0.036 * radius,
      0.048 * radius,
      0.060 * radius
    ];

    const tex = this.proceduralTextures.getTextures();

    const materials = [
      new THREE.MeshStandardMaterial({
        map: tex.serosaTexture,
        roughness: 0.24,
        metalness: 0.08,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.longitudinalMuscleTexture,
        bumpMap: tex.longitudinalMuscleBump,
        bumpScale: 0.025,
        roughness: 0.48,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.circularMuscleTexture,
        bumpMap: tex.circularMuscleBump,
        bumpScale: 0.025,
        roughness: 0.50,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.obliqueMuscleTexture,
        bumpMap: tex.obliqueMuscleBump,
        bumpScale: 0.025,
        roughness: 0.52,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.submucosaTexture,
        bumpMap: tex.submucosaBump,
        bumpScale: 0.012,
        roughness: 0.42,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.mucosaTexture,
        bumpMap: tex.mucosaBump,
        bumpScale: 0.045,
        roughness: 0.34,
        metalness: 0.05,
        side: THREE.DoubleSide
      })
    ];

    wallLayersDef.forEach((layerDef, idx) => {
      const d = insets[idx] || 0;
      const geo = origGeo.clone();
      if (d > 0) {
        const posAttr = geo.attributes.position;
        const normAttr = geo.attributes.normal;
        for (let i = 0; i < posAttr.count; i++) {
          const px = posAttr.getX(i) - normAttr.getX(i) * d;
          const py = posAttr.getY(i) - normAttr.getY(i) * d;
          const pz = posAttr.getZ(i) - normAttr.getZ(i) * d;
          posAttr.setXYZ(i, px, py, pz);
        }
        posAttr.needsUpdate = true;
      }

      const mesh = new THREE.Mesh(geo, materials[idx]);
      mesh.name = layerDef.id;
      mesh.position.copy(stomachMesh.position);
      mesh.rotation.copy(stomachMesh.rotation);
      mesh.scale.copy(stomachMesh.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.userData = {
        organId: 'stomach',
        isStomachWallLayer: true,
        wallLayerId: layerDef.id,
        wallLayerOrder: layerDef.layerOrder || (idx + 1),
        wallLayerName: layerDef.name,
        wallLayerColor: layerDef.color || '#e11d48',
        wallLayerThickness: layerDef.thickness || '',
        wallLayerDesc: layerDef.description || '',
        rawName: layerDef.name,
        localCenter: localCenter.clone(),
        initialPos: stomachMesh.position.clone(),
        // Whole-system radial explosion vector for stomach
        explodeVector: new THREE.Vector3(7.5, 2.5, 4.5)
      };

      stomachMesh.parent.add(mesh);
      this.stomachWallMeshes.push(mesh);
    });

    stomachMesh.visible = false;
    return this.stomachWallMeshes;
  }

  /**
   * Records the normalized world-space center of the unexploded stomach after masterRoot is scaled/positioned.
   */
  recordBaseCenterWorld() {
    if (this.stomachWallMeshes.length > 0) {
      const m0 = this.stomachWallMeshes[0];
      m0.updateWorldMatrix(true, false);
      const box0 = new THREE.Box3().setFromObject(m0);
      box0.getCenter(this.baseCenterWorld);
    }
  }

  /**
   * Updates clipping planes for both Cutaway Window mode and Exploded 6-Layer mode.
   * @param {boolean} isCutawayOpen
   * @param {number} wallExplodeFactor (0..1)
   */
  updateClipping(isCutawayOpen, wallExplodeFactor) {
    if (!this.stomachWallMeshes || this.stomachWallMeshes.length === 0) return;

    const isExplodingLayers = wallExplodeFactor > 0.01;
    const windowNormal = new THREE.Vector3(0.3, 0.1, -0.95).normalize();
    const windowOffsets = [0.008, 0.015, 0.022, 0.029, 0.036, 0.043];

    if (!isCutawayOpen && !isExplodingLayers) {
      const unclippedPlane = new THREE.Plane(windowNormal, 10.0);
      this.stomachWallMeshes.forEach(mesh => {
        mesh.material.clippingPlanes = [unclippedPlane];
      });
      return;
    }

    const tempBox = new THREE.Box3();
    const worldCenter = new THREE.Vector3();
    const worldDelta = new THREE.Vector3();

    this.stomachWallMeshes.forEach((mesh, idx) => {
      if (!mesh.visible) return;

      mesh.updateWorldMatrix(true, false);
      tempBox.setFromObject(mesh);
      tempBox.getCenter(worldCenter);
      worldDelta.subVectors(worldCenter, this.baseCenterWorld);
      const shiftCompensation = -windowNormal.dot(worldDelta);

      if (isExplodingLayers) {
        if (idx === 5) {
          // Layer 6 (Mucosa & Rugae): Keep co-moving anterior lumen window open when cutaway is enabled
          const c = isCutawayOpen ? (0.022 + shiftCompensation) : 10.0;
          mesh.material.clippingPlanes = [new THREE.Plane(windowNormal, c)];
          mesh.material.clipShadows = true;
        } else {
          // Layers 1..5 (Serosa, Longitudinal, Circular, Oblique, Submucosa):
          // Smoothly close the front cutaway window as layers separate so each separated layer
          // displays its complete, intact J-shaped 3D stomach geometry and directional fiber textures.
          if (wallExplodeFactor >= 0.28 || !isCutawayOpen) {
            mesh.material.clippingPlanes = [new THREE.Plane(windowNormal, 10.0)];
          } else {
            const closeProgress = wallExplodeFactor / 0.28;
            const baseConst = windowOffsets[idx] + closeProgress * 0.14;
            mesh.material.clippingPlanes = [new THREE.Plane(windowNormal, baseConst + shiftCompensation)];
            mesh.material.clipShadows = true;
          }
        }
      } else if (isCutawayOpen) {
        // Assembled Stepped Cutaway Window
        const plane = new THREE.Plane(windowNormal, (windowOffsets[idx] || 0.02) + shiftCompensation);
        mesh.material.clippingPlanes = [plane];
        mesh.material.clipShadows = true;
      }
    });
  }
}
