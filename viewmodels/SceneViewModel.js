import { Observable } from './Observable.js';

/**
 * SceneViewModel
 * Coordinates 3D camera target, selection, hover states, and camera animation triggers.
 */
export class SceneViewModel extends Observable {
  constructor(appVM) {
    super({
      selectedOrganId: null,
      hoveredOrganId: null,
      cameraTarget: [0, 0, 0],
      cameraPosition: [0, 0, 15],
      isFocusing: false
    });
    this.appVM = appVM;
  }

  selectOrgan(organId) {
    if (this.state.selectedOrganId === organId) {
      // Toggle off if already selected
      this.state.selectedOrganId = null;
      this.appVM.dissectionVM.setLocalExplodeOrgan(null);
    } else {
      this.state.selectedOrganId = organId;
      this.appVM.dissectionVM.setLocalExplodeOrgan(organId);
    }
  }

  setHoveredOrgan(organId) {
    this.state.hoveredOrganId = organId;
  }

  resetCamera() {
    this.state.cameraTarget = [0, -0.5, 0];
    this.state.cameraPosition = [0, 0, 16];
    this.state.selectedOrganId = null;
    this.appVM.dissectionVM.resetAll();
  }
}
