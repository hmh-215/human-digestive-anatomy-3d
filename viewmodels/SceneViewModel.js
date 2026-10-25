import { Observable } from './Observable.js';

/**
 * SceneViewModel
 * Coordinates 3D camera target, organ selection, rich hover callout state,
 * and camera animation triggers.
 */
export class SceneViewModel extends Observable {
  constructor(appVM) {
    super({
      selectedOrganId: null,
      hoveredOrganId: null,
      hoveredPart: null, // { organId, wallLayerId, title, subtitle, tag, badge, color, x, y }
      cameraTarget: [0, 0, 0],
      cameraPosition: [0, 0, 15],
      isFocusing: false
    });
    this.appVM = appVM;
  }

  selectOrgan(organId) {
    if (this.state.selectedOrganId === organId) {
      return;
    }
    this.batch(() => {
      this.state.selectedOrganId = organId;
      // Reset explosion when switching context between Whole System and a specific Organ
      this.appVM.dissectionVM.setExplodeFactor(0.0);
      this.appVM.dissectionVM.setLocalExplodeOrgan(organId);
    });
  }

  clearSelection() {
    this.batch(() => {
      this.state.selectedOrganId = null;
      this.appVM.dissectionVM.setExplodeFactor(0.0);
      this.appVM.dissectionVM.setLocalExplodeOrgan(null);
      this.appVM.dissectionVM.setActiveWallLayer(null);
    });
  }

  setHoveredOrgan(organId) {
    this.state.hoveredOrganId = organId;
  }

  setHoveredPart(partData) {
    this.state.hoveredPart = partData;
    this.state.hoveredOrganId = partData ? partData.organId : null;
  }

  setCameraTarget(target, position) {
    this.batch(() => {
      if (target) this.state.cameraTarget = target;
      if (position) this.state.cameraPosition = position;
    });
  }

  resetCamera() {
    this.batch(() => {
      this.state.cameraTarget = [0, -0.5, 0];
      this.state.cameraPosition = [0, 0, 14];
      this.state.selectedOrganId = null;
      this.state.hoveredPart = null;
      this.appVM.dissectionVM.resetAll();
    });
  }
}
