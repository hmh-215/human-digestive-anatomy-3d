import * as THREE from 'three';

/**
 * StomachLayersBuilder.js (HollowOrganLayersBuilder)
 * Module 2: Builds concentric histological layers for all hollow visceral organs:
 *   - Stomach (Dạ dày - 6 layers)
 *   - Duodenum (Tá tràng - 5 layers with Brunner's glands & Kerckring folds)
 *   - Small Intestine (Ruột non - 5 layers with Auerbach plexus & Villi)
 *   - Large Intestine / Colon (Đại tràng - 5 layers with Taeniae coli & Haustra)
 *
 * Manages both:
 *   1. Stepped Cutaway Window (Cắt mở lòng bậc thang) when assembled
 *   2. Orthogonal Near-to-Far Depth Explosion when separated
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
    this.baseCenterWorld = new THREE.Vector3(0.688, 0.339, 0.206);
  }

  /**
   * Builds concentric layer meshes from a base hollow organ mesh.
   * Signature: createLayers(organId, baseMesh, organsData) or legacy createLayers(stomachMesh, organsData)
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

    const origGeo = baseMesh.geometry;
    if (!origGeo.attributes.normal) {
      origGeo.computeVertexNormals();
    }
    origGeo.computeBoundingSphere();
    origGeo.computeBoundingBox();

    const radius = (origGeo.boundingSphere && origGeo.boundingSphere.radius)
      ? origGeo.boundingSphere.radius
      : 8.0;

    const localCenter = new THREE.Vector3();
    if (origGeo.boundingBox) {
      origGeo.boundingBox.getCenter(localCenter);

      // Generate clean, anatomically aligned UV coordinates across the tubular / J-shaped organ
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
        uvArray[i * 2]     = nx * 2.0 + nz * 0.8;
        uvArray[i * 2 + 1] = ny * 2.5;
      }
      origGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    }

    const organData = (organsData || []).find(o => o.id === organId);
    const wallLayersDef = (organData && organData.wallLayers) || [];
    const count = wallLayersDef.length || (organId === 'stomach' ? 6 : 5);

    // Compute concentric normal insets proportional to bounding radius
    const insets = [];
    for (let i = 0; i < count; i++) {
      insets.push(i * (0.060 / Math.max(1, count - 1)) * radius);
    }

    const tex = this.proceduralTextures.getTextures();
    const materials = this._getMaterialsForOrgan(organId, tex);

    const organSysVecs = {
      stomach: new THREE.Vector3(12.0, 7.0, 7.0),
      duodenum: new THREE.Vector3(-4.0, -1.0, 8.0),
      small_intestine: new THREE.Vector3(0.0, -10.0, 11.0),
      large_intestine: new THREE.Vector3(0.0, -4.0, 3.0)
    };
    const sysVec = organSysVecs[organId] || new THREE.Vector3(0, 0, 5);

    const layerMeshes = [];

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

      const mat = materials[idx] || materials[0];
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
        totalLayers: count,
        wallLayerName: layerDef.name,
        wallLayerColor: layerDef.color || '#e11d48',
        wallLayerThickness: layerDef.thickness || '',
        wallLayerDesc: layerDef.description || '',
        rawName: layerDef.name,
        localCenter: localCenter.clone(),
        initialPos: baseMesh.position.clone(),
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
    }

    return layerMeshes;
  }

  _getMaterialsForOrgan(organId, tex) {
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
   * Updates clipping planes for both Cutaway Window mode and Exploded Layer mode.
   */
  updateClipping(selectedOrganId, isCutawayOpen, wallExplodeFactor) {
    // If called with legacy 2 args: updateClipping(isCutawayOpen, wallExplodeFactor)
    if (typeof selectedOrganId === 'boolean') {
      wallExplodeFactor = isCutawayOpen;
      isCutawayOpen = selectedOrganId;
      selectedOrganId = 'stomach';
    }

    const organId = selectedOrganId || 'stomach';
    const meshes = this.organLayersMap.get(organId) || this.stomachWallMeshes;
    if (!meshes || meshes.length === 0) return;

    // Clear clipping on other hollow organs so they remain solid without leftover cuts
    this.organLayersMap.forEach((otherMeshes, otherId) => {
      if (otherId !== organId) {
        otherMeshes.forEach(mesh => {
          if (mesh.material && mesh.material.clippingPlanes) {
            mesh.material.clippingPlanes = null;
            mesh.material.needsUpdate = true;
          }
        });
      }
    });

    const isExplodingLayers = (wallExplodeFactor > 0.01);
    const windowNormal = new THREE.Vector3(0.3, 0.1, -0.95).normalize();
    const windowOffsets = [0.008, 0.015, 0.022, 0.029, 0.036, 0.043];

    if (!isCutawayOpen && !isExplodingLayers) {
      meshes.forEach(mesh => {
        if (mesh.material.clippingPlanes) {
          mesh.material.clippingPlanes = null;
          mesh.material.needsUpdate = true;
        }
      });
      return;
    }

    const tempBox = new THREE.Box3();
    const worldCenter = new THREE.Vector3();
    const worldDelta = new THREE.Vector3();
    const baseCenter = this.getBaseCenter(organId);
    const innermostIdx = meshes.length - 1;

    meshes.forEach((mesh, idx) => {
      if (!mesh.visible) return;

      mesh.updateWorldMatrix(true, false);
      tempBox.setFromObject(mesh);
      tempBox.getCenter(worldCenter);
      worldDelta.subVectors(worldCenter, baseCenter);
      const shiftCompensation = -windowNormal.dot(worldDelta);

      if (isExplodingLayers) {
        if (idx === innermostIdx) {
          // Innermost layer (Mucosa): Keep co-moving anterior lumen window open when cutaway is enabled
          if (isCutawayOpen) {
            mesh.material.clippingPlanes = [new THREE.Plane(windowNormal, 0.022 + shiftCompensation)];
            mesh.material.clipShadows = true;
          } else {
            mesh.material.clippingPlanes = null;
          }
          mesh.material.needsUpdate = true;
        } else {
          // Outer layers: Solid complete 3D models with full PBR textures when separated
          if (wallExplodeFactor >= 0.25 || !isCutawayOpen) {
            if (mesh.material.clippingPlanes) {
              mesh.material.clippingPlanes = null;
              mesh.material.needsUpdate = true;
            }
          } else {
            const closeProgress = wallExplodeFactor / 0.25;
            const baseConst = (windowOffsets[idx] || 0.02) + closeProgress * 0.14;
            mesh.material.clippingPlanes = [new THREE.Plane(windowNormal, baseConst + shiftCompensation)];
            mesh.material.clipShadows = true;
            mesh.material.needsUpdate = true;
          }
        }
      } else if (isCutawayOpen) {
        // Assembled Stepped Cutaway Window
        const plane = new THREE.Plane(windowNormal, (windowOffsets[idx] || 0.02) + shiftCompensation);
        mesh.material.clippingPlanes = [plane];
        mesh.material.clipShadows = true;
        mesh.material.needsUpdate = true;
      }
    });
  }
}
