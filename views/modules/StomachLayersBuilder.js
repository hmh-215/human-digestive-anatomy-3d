import * as THREE from 'three';

/**
 * StomachLayersBuilder.js (HollowOrganLayersBuilder)
 * Module 2: Builds concentric histological layers for all 6 hollow visceral organs:
 *   1. Stomach (Dạ dày - 6 layers)
 *   2. Duodenum (Tá tràng - 5 layers with Brunner's glands & Kerckring folds)
 *   3. Small Intestine (Ruột non - 5 layers with Auerbach plexus & Villi, tube-safe inset)
 *   4. Large Intestine / Colon (Đại tràng toàn khung - 5 layers merging Ascending, Transverse,
 *      Descending, Sigmoid, Appendix & 3 Taeniae coli bands)
 *   5. Gallbladder (Túi mật - 4 layers: Serosa/Fibrous, Muscularis, Lamina Propria, Honeycomb Mucosa)
 *   6. Esophagus (Thực quản - 5 layers: Adventitia, Longitudinal, Circular, Submucosa, Squamous Mucosa)
 *
 * Manages:
 *   - Per-Organ & Per-Layer Local 50% Longitudinal Coronal Cutaway Plane
 *   - Tube-Safe Normal Inset + PolygonOffset (zero mesh shredding on coiled intestines)
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
  }

  /**
   * Merges an array of Three.js Meshes into a single unified BufferGeometry
   * in their parent's local coordinate space.
   */
  _mergeMeshesToGeometry(meshes) {
    const positions = [];
    const normals = [];
    const indices = [];
    let vertexOffset = 0;

    meshes.forEach((m) => {
      if (!m || !m.geometry) return;
      m.updateMatrix();
      const g = m.geometry.clone();
      if (!g.attributes.normal) {
        g.computeVertexNormals();
      }
      g.applyMatrix4(m.matrix);

      const posAttr = g.attributes.position;
      const normAttr = g.attributes.normal;
      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
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
   * by merging Ascending, Transverse, Descending, Sigmoid colon & Vermiform appendix,
   * and integrating the 3 Taeniae coli bands directly into Layer 2 (Longitudinal Muscle).
   */
  createColonCompositeLayers(colonWallMeshes, taeniaMeshes, organsData, parentGroup) {
    if (!colonWallMeshes || colonWallMeshes.length === 0) return [];

    const baseWallGeo = this._mergeMeshesToGeometry(colonWallMeshes);
    this._assignAnatomicalUVs(baseWallGeo);

    // Layer 2 (idx = 1: Longitudinal Muscle) includes both the colon wall and the 3 raised Taeniae coli bands
    let longitudinalGeo = null;
    if (taeniaMeshes && taeniaMeshes.length > 0) {
      longitudinalGeo = this._mergeMeshesToGeometry([...colonWallMeshes, ...taeniaMeshes]);
      this._assignAnatomicalUVs(longitudinalGeo);
    }

    // Hide original separate colon & taenia meshes so only the 5 unified concentric layers render
    colonWallMeshes.forEach(m => { m.visible = false; });
    if (taeniaMeshes) {
      taeniaMeshes.forEach(m => { m.visible = false; });
    }

    const dummyMesh = new THREE.Mesh(baseWallGeo);
    dummyMesh.position.set(0, 0, 0);
    dummyMesh.rotation.set(0, 0, 0);
    dummyMesh.scale.set(1, 1, 1);
    parentGroup.add(dummyMesh);

    const layers = this.createLayers('large_intestine', dummyMesh, organsData, longitudinalGeo);
    parentGroup.remove(dummyMesh);
    return layers;
  }

  /**
   * Builds concentric layer meshes from a base hollow organ mesh.
   * Signature: createLayers(organId, baseMesh, organsData, customLayer1Geo)
   */
  createLayers(arg1, arg2, arg3, customLayer1Geo = null) {
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

    const origGeo = baseMesh.geometry;
    if (!origGeo.attributes.normal) {
      origGeo.computeVertexNormals();
    }
    origGeo.computeBoundingSphere();
    origGeo.computeBoundingBox();

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

    // Tube-safe maximum normal inset (in Z-Anatomy local centimeter units)
    // Prevents narrow coiled tubes (like Jejunum/Small Intestine) from self-intersecting or shredding!
    const safeMaxInsetMap = {
      stomach: 0.26,
      duodenum: 0.08,
      small_intestine: 0.025,
      large_intestine: 0.045,
      gallbladder_tree: 0.055,
      esophagus: 0.045
    };
    const maxInset = safeMaxInsetMap[organId] !== undefined ? safeMaxInsetMap[organId] : 0.05;

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

    const layerMeshes = [];

    wallLayersDef.forEach((layerDef, idx) => {
      const d = insets[idx] || 0;
      const sourceGeo = (idx === 1 && customLayer1Geo) ? customLayer1Geo : origGeo;
      const geo = sourceGeo.clone();

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

      const mat = (materials[idx] || materials[0]).clone();
      // Depth bias so concentric layers never Z-fight even with small tube-safe normal insets
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -idx * 0.5;
      mat.polygonOffsetUnits = -idx * 0.5;

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
          bumpScale: 0.030,
          roughness: 0.50,
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
   * preventing organs like Duodenum or Small Intestine from being over-clipped or disappearing.
   */
  updateClipping(selectedOrganId, isCutawayOpen, wallExplodeFactor) {
    if (typeof selectedOrganId === 'boolean') {
      wallExplodeFactor = isCutawayOpen;
      isCutawayOpen = selectedOrganId;
      selectedOrganId = null;
    }

    // If Cutaway mode is OFF, remove all clipping planes from all hollow organs
    if (!isCutawayOpen) {
      this.organLayersMap.forEach((meshes) => {
        meshes.forEach(mesh => {
          if (mesh.material && mesh.material.clippingPlanes) {
            mesh.material.clippingPlanes = null;
            mesh.material.needsUpdate = true;
          }
        });
      });
      return;
    }

    // Coronal longitudinal cutaway normal: keeps posterior 50% (z <= d) and removes anterior 50% (z > d)
    const coronalNormal = new THREE.Vector3(0, 0, -1);
    const tempBox = new THREE.Box3();
    const worldCenter = new THREE.Vector3();
    const t = Math.max(0, Math.min(1, wallExplodeFactor || 0));

    this.organLayersMap.forEach((meshes, organId) => {
      // Clip either the currently selected hollow organ, or all hollow organs when in Whole-System view
      const shouldClipThisOrgan = (!selectedOrganId) || (selectedOrganId === organId);

      if (!shouldClipThisOrgan) {
        meshes.forEach(mesh => {
          if (mesh.material && mesh.material.clippingPlanes) {
            mesh.material.clippingPlanes = null;
            mesh.material.needsUpdate = true;
          }
        });
        return;
      }

      const N = meshes.length;
      meshes.forEach((mesh, idx) => {
        if (!mesh.visible) return;

        mesh.updateWorldMatrix(true, false);
        tempBox.setFromObject(mesh);
        tempBox.getCenter(worldCenter);
        const sizeZ = Math.max(0.05, tempBox.max.z - tempBox.min.z);

        // When assembled (t < 0.08), add a subtle stepped offset around the 50% plane
        // so concentric wall rims are visible like a histological staircase;
        // when exploded (t >= 0.08), cut every layer at its exact 50.0% Z midpoint!
        const assembleBlend = Math.max(0, 1 - (t / 0.08));
        const centeredIdx = ((N - 1) / 2.0) - idx;
        const stepOffset = assembleBlend * centeredIdx * (sizeZ * 0.022);

        const planeConstant = worldCenter.z + stepOffset;
        mesh.material.clippingPlanes = [new THREE.Plane(coronalNormal, planeConstant)];
        mesh.material.clipShadows = true;
        mesh.material.needsUpdate = true;
      });
    });
  }
}
