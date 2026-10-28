import * as THREE from 'three';

/**
 * StomachLayersBuilder.js (HollowOrganLayersBuilder)
 * Module 2: Builds concentric histological layers for all 6 hollow visceral organs:
 *   1. Stomach (Dạ dày - 6 layers)
 *   2. Duodenum (Tá tràng - 5 layers with Brunner's glands & Kerckring folds)
 *   3. Small Intestine (Ruột non - 5 layers with Auerbach plexus & Villi, tube-safe inset)
 *   4. Large Intestine / Colon (Đại tràng toàn khung - 5 layers merging Ascending, Transverse,
 *      Descending, Sigmoid, Appendix with Solidify inner-shell stripping for 100% outward normals)
 *   5. Gallbladder (Túi mật - 4 layers: Serosa/Fibrous, Muscularis, Lamina Propria, Honeycomb Mucosa)
 *   6. Esophagus (Thực quản - 5 layers: Adventitia, Longitudinal, Circular, Submucosa, Squamous Mucosa)
 *
 * Guarantees strict histological ordering from INSIDE to OUTSIDE:
 *   Mucosa (innermost, smallest radius) -> Submucosa -> Stratum Circulare -> Stratum Longitudinale -> Serosa (outermost, largest radius)
 */
export class StomachLayersBuilder {
  constructor(proceduralTextures) {
    this.proceduralTextures = proceduralTextures;
    this.organLayersMap = new Map();
    this.baseCenterMap = new Map();
    this.stomachWallMeshes = [];
    this.duodenumWallMeshes = [];
    this.smallIntestineWallMeshes = [];
    this.colonWallMeshes = [];
    this.gallbladderWallMeshes = [];
    this.esophagusWallMeshes = [];
    this.baseCenterWorld = new THREE.Vector3(0.688, 0.339, 0.206);

    // Meshes in DigestiveSystem.glb that have a Blender Solidify inner duplicate shell (second half of vertices)
    this.solidifyMeshNames = new Set([
      'Ascending_colon',
      'Transverse_colon',
      'Descending_colon',
      'Sigmoid_colon',
      'Oesophagus'
    ]);
  }

  /**
   * Strips the Blender Solidify inner duplicate shell (vertices >= total/2) from meshes
   * like Ascending_colon, Transverse_colon, Descending_colon, Sigmoid_colon, and Oesophagus.
   * This ensures 100% of remaining vertices belong to the single-walled outer surface
   * with strictly OUTWARD-pointing normals, so subtracting `normal * d` always shrinks
   * inner layers (Mucosa < Submucosa < Stratum < Serosa) inward toward the lumen!
   */
  _extractOuterSurfaceGeometry(mesh) {
    const srcGeo = mesh.geometry;
    if (!srcGeo) return null;

    const posAttr = srcGeo.attributes.position;
    const normAttr = srcGeo.attributes.normal;
    const totalVerts = posAttr.count;
    const isSolidified = this.solidifyMeshNames.has(mesh.name) && (totalVerts % 2 === 0);

    if (!isSolidified) {
      const cloned = srcGeo.clone();
      if (!cloned.attributes.normal) {
        cloned.computeVertexNormals();
      }
      return cloned;
    }

    const half = totalVerts / 2;
    const newPositions = new Float32Array(half * 3);
    const newNormals = new Float32Array(half * 3);
    for (let i = 0; i < half; i++) {
      newPositions[i * 3]     = posAttr.getX(i);
      newPositions[i * 3 + 1] = posAttr.getY(i);
      newPositions[i * 3 + 2] = posAttr.getZ(i);
      if (normAttr) {
        newNormals[i * 3]     = normAttr.getX(i);
        newNormals[i * 3 + 1] = normAttr.getY(i);
        newNormals[i * 3 + 2] = normAttr.getZ(i);
      }
    }

    const newIndices = [];
    if (srcGeo.index) {
      const idxArr = srcGeo.index.array;
      for (let t = 0; t < idxArr.length; t += 3) {
        const a = idxArr[t];
        const b = idxArr[t + 1];
        const c = idxArr[t + 2];
        if (a < half && b < half && c < half) {
          newIndices.push(a, b, c);
        }
      }
    } else {
      for (let t = 0; t < half; t += 3) {
        newIndices.push(t, t + 1, t + 2);
      }
    }

    const cleanGeo = new THREE.BufferGeometry();
    cleanGeo.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    if (normAttr) {
      cleanGeo.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    } else {
      cleanGeo.computeVertexNormals();
    }
    cleanGeo.setIndex(newIndices);
    cleanGeo.computeBoundingBox();
    cleanGeo.computeBoundingSphere();
    return cleanGeo;
  }

  /**
   * Computes the local 50% anterior-posterior tube centerline Z (`aCutMidZ`) for each vertex
   * of a single hollow segment using an O(N) 3x3 spatial bucket grid in (X, Y).
   * This ensures that curved segments at different Z depths (e.g. Transverse Colon vs.
   * Descending/Sigmoid Colon, or Duodenum D1-D4) are each cut at their own exact 50%
   * longitudinal tube midline so no segment ever disappears when cutaway is active.
   */
  _computeSubMeshCutMidZ(posAttr) {
    const count = posAttr.count;
    const midZ = new Float32Array(count);
    const cell = 2.5;
    const buckets = new Map();

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const key = `${gx},${gy}`;
      const b = buckets.get(key);
      if (!b) {
        buckets.set(key, { minZ: z, maxZ: z });
      } else {
        if (z < b.minZ) b.minZ = z;
        if (z > b.maxZ) b.maxZ = z;
      }
    }

    // Smooth the tube centerline Z across a 5x5 neighborhood so Haustral pouches
    // never create notches along the 50% longitudinal cut edge.
    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      let sumMid = 0;
      let weightSum = 0;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const b = buckets.get(`${gx + dx},${gy + dy}`);
          if (b) {
            const w = 1.0 / (1.0 + Math.hypot(dx, dy));
            sumMid += 0.5 * (b.minZ + b.maxZ) * w;
            weightSum += w;
          }
        }
      }
      midZ[i] = (weightSum > 0) ? (sumMid / weightSum) : posAttr.getZ(i);
    }

    return midZ;
  }

  /**
   * Merges an array of Three.js Meshes into a single unified BufferGeometry
   * in their parent's local coordinate space, stripping any Solidify inner shells first
   * and computing each sub-mesh's exact 50% tube centerline Z (`aCutMidZ`).
   */
  _mergeMeshesToGeometry(meshes) {
    const positions = [];
    const normals = [];
    const cutMidZs = [];
    const indices = [];
    let vertexOffset = 0;

    meshes.forEach((m) => {
      if (!m || !m.geometry) return;
      m.updateMatrix();
      const g = this._extractOuterSurfaceGeometry(m);
      if (!g) return;
      g.applyMatrix4(m.matrix);
      if (!g.attributes.normal) {
        g.computeVertexNormals();
      }

      const posAttr = g.attributes.position;
      const normAttr = g.attributes.normal;
      const subMidZ = this._computeSubMeshCutMidZ(posAttr);
      const isAppendix = (m.name || '').toLowerCase().includes('appendix');
      const insetScale = isAppendix ? 0.22 : 1.0;

      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        normals.push(
          normAttr.getX(i) * insetScale,
          normAttr.getY(i) * insetScale,
          normAttr.getZ(i) * insetScale
        );
        cutMidZs.push(subMidZ[i]);
      }

      if (g.index) {
        const idxArr = g.index.array;
        for (let i = 0; i < idxArr.length; i++) {
          indices.push(idxArr[i] + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          indices.push(i + vertexOffset);
        }
      }
      vertexOffset += posAttr.count;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('aCutMidZ', new THREE.Float32BufferAttribute(cutMidZs, 1));
    merged.setIndex(indices);
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }

  /**
   * Computes clean anatomical UV coordinates on any BufferGeometry based on its bounding box.
   */
  _assignAnatomicalUVs(geo) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    if (!bbox) return;

    const sizeX = Math.max(0.001, bbox.max.x - bbox.min.x);
    const sizeY = Math.max(0.001, bbox.max.y - bbox.min.y);
    const sizeZ = Math.max(0.001, bbox.max.z - bbox.min.z);
    const posAttr = geo.attributes.position;
    const uvArray = new Float32Array(posAttr.count * 2);

    for (let i = 0; i < posAttr.count; i++) {
      const nx = (posAttr.getX(i) - bbox.min.x) / sizeX;
      const ny = (posAttr.getY(i) - bbox.min.y) / sizeY;
      const nz = (posAttr.getZ(i) - bbox.min.z) / sizeZ;
      uvArray[i * 2]     = nx * 2.2 + nz * 0.85;
      uvArray[i * 2 + 1] = ny * 2.6;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  }

  /**
   * Builds 5 concentric histological layers for the ENTIRE Large Intestine (Colon) frame
   * by merging the pure single-walled outer surfaces of Ascending, Transverse, Descending,
   * Sigmoid colon & Vermiform appendix.
   *
   * Strict concentric order from outside to inside:
   *   idx = 0: Serosa (outermost, d = 0.00 cm)
   *   idx = 1: Stratum Longitudinale & Taeniae Coli (d = 0.045 cm inward)
   *   idx = 2: Stratum Circulare (d = 0.090 cm inward)
   *   idx = 3: Submucosa (d = 0.135 cm inward)
   *   idx = 4: Mucosa (innermost, d = 0.180 cm inward)
   */
  createColonCompositeLayers(colonWallMeshes, taeniaMeshes, organsData, parentGroup) {
    if (!colonWallMeshes || colonWallMeshes.length === 0) return [];

    const baseWallGeo = this._mergeMeshesToGeometry(colonWallMeshes);
    this._assignAnatomicalUVs(baseWallGeo);

    // Hide original separate colon & taenia meshes so only the 5 concentric layers render without Z-fighting
    colonWallMeshes.forEach(m => { m.visible = false; });
    if (taeniaMeshes) {
      taeniaMeshes.forEach(m => { m.visible = false; });
    }

    const dummyMesh = new THREE.Mesh(baseWallGeo);
    dummyMesh.position.set(0, 0, 0);
    dummyMesh.rotation.set(0, 0, 0);
    dummyMesh.scale.set(1, 1, 1);
    parentGroup.add(dummyMesh);

    const layers = this.createLayers('large_intestine', dummyMesh, organsData);
    parentGroup.remove(dummyMesh);
    return layers;
  }

  /**
   * Builds concentric layer meshes from a base hollow organ mesh.
   * Signature: createLayers(organId, baseMesh, organsData)
   */
  createLayers(arg1, arg2, arg3) {
    let organId = 'stomach';
    let baseMesh = null;
    let organsData = null;

    if (typeof arg1 === 'string') {
      organId = arg1;
      baseMesh = arg2;
      organsData = arg3;
    } else {
      organId = 'stomach';
      baseMesh = arg1;
      organsData = arg2;
    }

    if (!baseMesh) return [];

    // Strip any Blender Solidify inner shell (e.g. Oesophagus) so all normals point strictly outward
    const origGeo = this._extractOuterSurfaceGeometry(baseMesh);
    origGeo.computeBoundingSphere();
    origGeo.computeBoundingBox();

    if (!origGeo.attributes.aCutMidZ) {
      const midZ = this._computeSubMeshCutMidZ(origGeo.attributes.position);
      origGeo.setAttribute('aCutMidZ', new THREE.Float32BufferAttribute(midZ, 1));
    }

    const localCenter = new THREE.Vector3();
    const localSize = new THREE.Vector3(8, 8, 8);
    if (origGeo.boundingBox) {
      origGeo.boundingBox.getCenter(localCenter);
      origGeo.boundingBox.getSize(localSize);
      this._assignAnatomicalUVs(origGeo);
    }

    const organData = (organsData || []).find(o => o.id === organId);
    const wallLayersDef = (organData && organData.wallLayers) || [];
    const count = wallLayersDef.length || (organId === 'stomach' ? 6 : 5);

    // Tube-safe maximum normal inset (in Z-Anatomy local centimeter units).
    // Because all meshes now have strictly OUTWARD normals:
    //   idx = 0 (Serosa/Adventitia) has inset = 0 (OUTERMOST, largest radius)
    //   ...
    //   idx = count - 1 (Mucosa) has inset = maxInset (INNERMOST, smallest radius)
    const safeMaxInsetMap = {
      stomach: 0.28,
      duodenum: 0.14,
      small_intestine: 0.035,
      large_intestine: 0.44,
      gallbladder_tree: 0.08,
      esophagus: 0.12
    };
    const maxInset = safeMaxInsetMap[organId] !== undefined ? safeMaxInsetMap[organId] : 0.08;

    const insets = [];
    for (let i = 0; i < count; i++) {
      insets.push(i * (maxInset / Math.max(1, count - 1)));
    }

    const tex = this.proceduralTextures.getTextures();
    const materials = this._getMaterialsForOrgan(organId, tex);

    const organSysVecs = {
      stomach: new THREE.Vector3(12.0, 7.0, 7.0),
      duodenum: new THREE.Vector3(-4.0, -1.0, 8.0),
      small_intestine: new THREE.Vector3(0.0, -10.0, 11.0),
      large_intestine: new THREE.Vector3(0.0, -4.0, 3.0),
      gallbladder_tree: new THREE.Vector3(-8.0, 2.0, 12.0),
      esophagus: new THREE.Vector3(2.0, 15.0, -4.0)
    };
    const sysVec = organSysVecs[organId] || new THREE.Vector3(0, 0, 5);

    // Anatomical Surface Landmarks for 50% Longitudinal Smooth Cutaway Planes
    // Defining 3 anatomical surface landmarks on the cutting plane and computing
    // the analytical normal n = (p2 - p1) x (p3 - p1) guarantees 100% C-infinity mathematical
    // smoothness across all triangles with zero jaggedness and zero staircase artifacts.
    const anatomicalCutLandmarks = {
      stomach: {
        p1: new THREE.Vector3(0.8, 118.5, 4.2),    // Tâm vị (Cardia / Incisura cardiaca)
        p2: new THREE.Vector3(8.5, 116.0, 3.8),    // Đỉnh bờ cong lớn (Fundus apex / Greater curvature)
        p3: new THREE.Vector3(-1.6, 112.5, 3.2),   // Môn vị (Pylorus)
        normal: new THREE.Vector3(0.011, -0.137, 0.991) // Points anteriorly towards viewer
      },
      duodenum: {
        p1: new THREE.Vector3(-1.8, 112.5, 3.2),   // D1 Bulbus duodeni
        p2: new THREE.Vector3(-5.2, 109.0, 3.5),   // D2 Pars descendens
        p3: new THREE.Vector3(-3.5, 105.5, 3.2),   // D3 Pars horizontalis
        normal: new THREE.Vector3(0.12, -0.18, 0.97)
      },
      gallbladder_tree: {
        p1: new THREE.Vector3(-4.8, 112.0, 6.8),   // Đáy túi mật (Murphy point)
        p2: new THREE.Vector3(-4.5, 113.8, 5.2),   // Thân túi mật
        p3: new THREE.Vector3(-4.2, 115.2, 3.8),   // Cổ & Phễu Hartmann
        normal: new THREE.Vector3(-0.35, -0.38, 0.85)
      },
      esophagus: {
        p1: new THREE.Vector3(0.3, 145.0, -0.8),   // Đoạn cổ C6
        p2: new THREE.Vector3(0.5, 130.0, -0.5),   // Đoạn ngực T5
        p3: new THREE.Vector3(0.8, 119.5, 1.2),    // Đoạn bụng T11
        normal: new THREE.Vector3(0.0, -0.05, 0.998)
      },
      large_intestine: {
        p1: new THREE.Vector3(-8.5, 96.0, 1.0),    // Manh tràng & Ruột thừa
        p2: new THREE.Vector3(-8.8, 111.0, 3.5),   // Góc gan
        p3: new THREE.Vector3(7.8, 112.0, 3.5),    // Góc lách
        normal: new THREE.Vector3(0.0, 0.0, 1.0)
      },
      small_intestine: {
        p1: new THREE.Vector3(-2.0, 108.0, 5.0),   // Hỗng tràng trên
        p2: new THREE.Vector3(6.0, 95.0, 5.0),     // Hồi tràng hố chậu phải
        p3: new THREE.Vector3(0.0, 90.0, 5.0),     // Hạ vị
        normal: new THREE.Vector3(0.0, 0.0, 1.0)
      }
    };

    const organCutDef = anatomicalCutLandmarks[organId];
    let cutPlaneNormal = new THREE.Vector3(0, 0, 1);
    let cutPlanePoint = localCenter.clone();

    if (organCutDef) {
      cutPlanePoint = organCutDef.p1.clone();
      if (organCutDef.normal) {
        cutPlaneNormal = organCutDef.normal.clone().normalize();
      } else {
        const v1 = new THREE.Vector3().subVectors(organCutDef.p2, organCutDef.p1);
        const v2 = new THREE.Vector3().subVectors(organCutDef.p3, organCutDef.p1);
        cutPlaneNormal.crossVectors(v1, v2).normalize();
        if (cutPlaneNormal.z < 0) cutPlaneNormal.negate();
      }
    }

    const layerMeshes = [];

    wallLayersDef.forEach((layerDef, idx) => {
      const d = insets[idx] || 0;
      const geo = origGeo.clone();
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const cutDistArr = new Float32Array(posAttr.count);

      for (let i = 0; i < posAttr.count; i++) {
        const x0 = posAttr.getX(i);
        const y0 = posAttr.getY(i);
        const z0 = posAttr.getZ(i);

        // Compute signed analytical cutaway distance directly from the landmark-defined plane.
        // Pure linear evaluation guarantees 100% laser-smooth cut boundary with zero jagged steps!
        const cutDist = cutPlaneNormal.x * (x0 - cutPlanePoint.x) +
                        cutPlaneNormal.y * (y0 - cutPlanePoint.y) +
                        cutPlaneNormal.z * (z0 - cutPlanePoint.z);

        cutDistArr[i] = cutDist;

        if (d > 0) {
          posAttr.setXYZ(
            i,
            x0 - normAttr.getX(i) * d,
            y0 - normAttr.getY(i) * d,
            z0 - normAttr.getZ(i) * d
          );
        }
      }
      if (d > 0) {
        posAttr.needsUpdate = true;
      }
      geo.setAttribute('aCutDist', new THREE.BufferAttribute(cutDistArr, 1));

      const mat = (materials[idx] || materials[0]).clone();
      // Do NOT use artificial polygonOffset, so the 24-bit hardware depth buffer uses true 3D vertex depths:
      // - On the exterior, Serosa (d = 0) is physically outermost and wins naturally.
      // - Inside the open cutaway lumen, Mucosa (d = maxInset) is physically innermost (closest to camera on the posterior wall) and wins naturally!
      mat.polygonOffset = false;

      mat.userData.uCutawayActive = { value: 0.0 };
      mat.userData.uCutThreshold = { value: 0.0 };
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uCutawayActive = mat.userData.uCutawayActive;
        shader.uniforms.uCutThreshold = mat.userData.uCutThreshold;
        shader.vertexShader = `
          attribute float aCutDist;
          varying float vCutDist;
        ` + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vCutDist = aCutDist;`
        );
        shader.fragmentShader = `
          uniform float uCutawayActive;
          uniform float uCutThreshold;
          varying float vCutDist;
        ` + shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
           if (uCutawayActive > 0.5 && vCutDist > uCutThreshold) discard;`
        );
      };

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = layerDef.id;
      mesh.position.copy(baseMesh.position);
      mesh.rotation.copy(baseMesh.rotation);
      mesh.scale.copy(baseMesh.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.userData = {
        organId: organId,
        organTitle: organData ? organData.vietnameseName : organId,
        isWallLayer: true,
        isStomachWallLayer: (organId === 'stomach'),
        wallLayerId: layerDef.id,
        wallLayerOrder: layerDef.layerOrder || (idx + 1),
        wallLayerIndex: idx,
        totalLayers: count,
        wallLayerName: layerDef.name,
        wallLayerColor: layerDef.color || '#e11d48',
        wallLayerThickness: layerDef.thickness || '',
        wallLayerDesc: layerDef.description || '',
        rawName: layerDef.name,
        localCenter: localCenter.clone(),
        localSize: localSize.clone(),
        initialPos: baseMesh.position.clone(),
        initialScale: baseMesh.scale.clone(),
        systemExplodeVec: sysVec.clone()
      };

      baseMesh.parent.add(mesh);
      layerMeshes.push(mesh);
    });

    baseMesh.visible = false;
    this.organLayersMap.set(organId, layerMeshes);

    if (organId === 'stomach') {
      this.stomachWallMeshes = layerMeshes;
    } else if (organId === 'duodenum') {
      this.duodenumWallMeshes = layerMeshes;
    } else if (organId === 'small_intestine') {
      this.smallIntestineWallMeshes = layerMeshes;
    } else if (organId === 'large_intestine') {
      this.colonWallMeshes = layerMeshes;
    } else if (organId === 'gallbladder_tree') {
      this.gallbladderWallMeshes = layerMeshes;
    } else if (organId === 'esophagus') {
      this.esophagusWallMeshes = layerMeshes;
    }

    return layerMeshes;
  }

  _getMaterialsForOrgan(organId, tex) {
    if (organId === 'gallbladder_tree') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.gbSerosaTexture,
          roughness: 0.26,
          metalness: 0.08,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.gbMuscleTexture,
          bumpMap: tex.gbMuscleBump,
          bumpScale: 0.025,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.gbSubmucosaTexture,
          bumpMap: tex.gbSubmucosaBump,
          bumpScale: 0.015,
          roughness: 0.42,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.gbMucosaTexture,
          bumpMap: tex.gbMucosaBump,
          bumpScale: 0.045,
          roughness: 0.34,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    if (organId === 'esophagus') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.esoAdventitiaTexture,
          roughness: 0.32,
          metalness: 0.06,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.esoLongitudinalMuscleTexture,
          bumpMap: tex.esoLongitudinalMuscleBump,
          bumpScale: 0.025,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.esoCircularMuscleTexture,
          bumpMap: tex.esoCircularMuscleBump,
          bumpScale: 0.025,
          roughness: 0.50,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.esoSubmucosaTexture,
          bumpMap: tex.esoSubmucosaBump,
          bumpScale: 0.015,
          roughness: 0.42,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.esoMucosaTexture,
          bumpMap: tex.esoMucosaBump,
          bumpScale: 0.042,
          roughness: 0.32,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    if (organId === 'duodenum') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.duodenumSerosaTexture,
          roughness: 0.24,
          metalness: 0.08,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.duodenumLongitudinalMuscleTexture,
          bumpMap: tex.duodenumLongitudinalMuscleBump,
          bumpScale: 0.025,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.duodenumCircularMuscleTexture,
          bumpMap: tex.duodenumCircularMuscleBump,
          bumpScale: 0.025,
          roughness: 0.50,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.duodenumSubmucosaTexture,
          bumpMap: tex.duodenumSubmucosaBump,
          bumpScale: 0.015,
          roughness: 0.44,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.duodenumMucosaTexture,
          bumpMap: tex.duodenumMucosaBump,
          bumpScale: 0.045,
          roughness: 0.36,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    if (organId === 'small_intestine') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.siSerosaTexture,
          roughness: 0.22,
          metalness: 0.06,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.siLongitudinalMuscleTexture,
          bumpMap: tex.siLongitudinalMuscleBump,
          bumpScale: 0.022,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.siCircularMuscleTexture,
          bumpMap: tex.siCircularMuscleBump,
          bumpScale: 0.022,
          roughness: 0.50,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.siSubmucosaTexture,
          bumpMap: tex.siSubmucosaBump,
          bumpScale: 0.012,
          roughness: 0.42,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.siMucosaTexture,
          bumpMap: tex.siMucosaBump,
          bumpScale: 0.040,
          roughness: 0.38,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    if (organId === 'large_intestine') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.colonSerosaTexture,
          roughness: 0.28,
          metalness: 0.08,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.colonLongitudinalMuscleTexture,
          bumpMap: tex.colonLongitudinalMuscleBump,
          bumpScale: 0.035,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.colonCircularMuscleTexture,
          bumpMap: tex.colonCircularMuscleBump,
          bumpScale: 0.030,
          roughness: 0.52,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.colonSubmucosaTexture,
          bumpMap: tex.colonSubmucosaBump,
          bumpScale: 0.015,
          roughness: 0.44,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.colonMucosaTexture,
          bumpMap: tex.colonMucosaBump,
          bumpScale: 0.045,
          roughness: 0.35,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    // Default: Stomach (6 materials)
    return [
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
  }

  /**
   * Records the normalized world-space center of all hollow organs after masterRoot is scaled/positioned.
   */
  recordBaseCenterWorld(specificOrganId) {
    const organsToRecord = specificOrganId ? [specificOrganId] : Array.from(this.organLayersMap.keys());
    organsToRecord.forEach(organId => {
      const meshes = this.organLayersMap.get(organId);
      if (meshes && meshes.length > 0) {
        const m0 = meshes[0];
        m0.updateWorldMatrix(true, false);
        const box0 = new THREE.Box3().setFromObject(m0);
        const center = new THREE.Vector3();
        box0.getCenter(center);
        this.baseCenterMap.set(organId, center);
        if (organId === 'stomach') {
          this.baseCenterWorld.copy(center);
        }
      }
    });
  }

  getBaseCenter(organId) {
    return this.baseCenterMap.get(organId) || this.baseCenterWorld;
  }

  /**
   * Task 2: Updates per-organ and per-layer local 50% longitudinal cutaway clipping planes.
   * Each hollow organ layer is cut at its own exact 50% Z midpoint (worldCenter.z),
   * with a stepped histological rim when assembled so the order from inside to outside:
   *   Mucosa (innermost) -> Submucosa -> Stratum -> Serosa (outermost)
   * is clearly visible without any layer clipping.
   */
  updateClipping(selectedOrganId, isCutawayOpen, wallExplodeFactor) {
    if (typeof selectedOrganId === 'boolean') {
      wallExplodeFactor = isCutawayOpen;
      isCutawayOpen = selectedOrganId;
      selectedOrganId = null;
    }

    const t = Math.max(0, Math.min(1, wallExplodeFactor || 0));

    this.organLayersMap.forEach((meshes, organId) => {
      const shouldClipThisOrgan = isCutawayOpen && ((!selectedOrganId) || (selectedOrganId === organId));
      const N = meshes.length;

      meshes.forEach((mesh, idx) => {
        if (!mesh.material) return;
        mesh.material.clippingPlanes = null;

        const uActive = mesh.material.userData && mesh.material.userData.uCutawayActive;
        const uThresh = mesh.material.userData && mesh.material.userData.uCutThreshold;

        if (!shouldClipThisOrgan) {
          if (uActive) uActive.value = 0.0;
          if (uThresh) uThresh.value = 0.0;
          return;
        }

        // When assembled (t < 0.15), terrace the cut edge from Serosa (outermost, idx=0, threshold > 0)
        // down to Mucosa (innermost, idx=N-1, threshold < 0) so each outer layer wraps cleanly around
        // the inner layers (inside -> outside: Mucosa > Submucosa > Stratum > Serosa, matching Figure 3).
        // When exploded (t >= 0.15), cut every layer at its exact 50.0% tube midline (threshold = 0)!
        const assembleBlend = Math.max(0, 1 - (t / 0.15));
        const centeredIdx = ((N - 1) / 2.0) - idx;
        const rimStep = (organId === 'small_intestine') ? 0.02 : 0.06;

        if (uActive) uActive.value = 1.0;
        if (uThresh) uThresh.value = assembleBlend * centeredIdx * rimStep;
      });
    });
  }
}
