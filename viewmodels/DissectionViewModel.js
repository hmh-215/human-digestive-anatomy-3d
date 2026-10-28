import { Observable } from './Observable.js';

/**
 * DissectionViewModel
 * Handles context-aware 3D explosion (whole-system or focused organ layers),
 * cutaway windowing, isolation mode, X-ray ghosting, and clinical torso opacity.
 */
export class DissectionViewModel extends Observable {
  constructor(appVM) {
    super({
      explodeFactor: 0.0, // Unified context-aware explosion factor (0..1)
      depthLevel: 1,
      visibleLayers: [1, 2, 3, 4, 5],
      localExplodeOrganId: null,
      localExplodeFactor: 0.0,
      isIsolateMode: false,
      isXRayMode: false,
      isCutawayOpen: false,
      organDisplayMode: 'layers', // 'layers' (histological layers) or 'regions' (functional heatmap)
      torsoSkinOpacity: 0.50,
      stomachWallLayers: {
        stomach_serosa: true,
        stomach_muscle_longitudinal: true,
        stomach_muscle_circular: true,
        stomach_muscle_oblique: true,
        stomach_submucosa: true,
        stomach_mucosa: true
      },
      stomachWallExplodeFactor: 0.0,
      activeWallLayerId: null
    });
    this.appVM = appVM;
  }

  /**
   * Sets the unified context-aware explosion factor (0.0 to 1.0).
   */
  setExplodeFactor(factor) {
    const clamped = Math.max(0, Math.min(1, factor));
    this.batch(() => {
      this.state.explodeFactor = clamped;
      this.state.localExplodeFactor = clamped;
      this.state.stomachWallExplodeFactor = clamped;
    });
  }

  setDepthLevel(level) {
    this.batch(() => {
      this.state.depthLevel = level;
      const layers = [];
      for (let i = level; i <= 5; i++) {
        layers.push(i);
      }
      this.state.visibleLayers = layers;
    });
  }

  setLocalExplodeOrgan(organId) {
    this.state.localExplodeOrganId = organId;
  }

  setLocalExplodeFactor(factor) {
    this.setExplodeFactor(factor);
  }

  setStomachWallExplodeFactor(factor) {
    this.setExplodeFactor(factor);
  }

  setState(partial) {
    if (!partial || typeof partial !== 'object') return;
    this.batch(() => {
      Object.entries(partial).forEach(([k, v]) => {
        if (k === 'explodeFactor') {
          const clamped = Math.max(0, Math.min(1, v));
          this.state.explodeFactor = clamped;
          this.state.localExplodeFactor = clamped;
          this.state.stomachWallExplodeFactor = clamped;
        } else {
          this.state[k] = v;
        }
      });
    });
  }

  setIsolateMode(val) {
    this.state.isIsolateMode = Boolean(val);
  }

  setCutawayOpen(val) {
    this.state.isCutawayOpen = Boolean(val);
  }

  toggleIsolateMode() {
    this.state.isIsolateMode = !this.state.isIsolateMode;
  }

  toggleXRayMode() {
    this.state.isXRayMode = !this.state.isXRayMode;
  }

  toggleCutaway() {
    this.state.isCutawayOpen = !this.state.isCutawayOpen;
  }

  setOrganDisplayMode(mode) {
    if (mode !== 'layers' && mode !== 'regions') return;
    this.state.organDisplayMode = mode;
  }

  toggleOrganDisplayMode() {
    const next = this.state.organDisplayMode === 'layers' ? 'regions' : 'layers';
    this.setOrganDisplayMode(next);
  }

  setTorsoSkinOpacity(opacity) {
    this.state.torsoSkinOpacity = Math.max(0, Math.min(1, opacity));
  }

  setActiveWallLayer(layerId) {
    this.state.activeWallLayerId = layerId;
  }

  resetAll() {
    this.batch(() => {
      this.state.explodeFactor = 0.0;
      this.state.depthLevel = 1;
      this.state.visibleLayers = [1, 2, 3, 4, 5];
      this.state.localExplodeOrganId = null;
      this.state.localExplodeFactor = 0.0;
      this.state.isIsolateMode = false;
      this.state.isXRayMode = false;
      this.state.isCutawayOpen = false;
      this.state.torsoSkinOpacity = 0.65;
      this.state.stomachWallExplodeFactor = 0.0;
      this.state.activeWallLayerId = null;
    });
  }
}
