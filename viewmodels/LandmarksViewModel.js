import { Observable } from './Observable.js';

/**
 * LandmarksViewModel
 * Manages clinical surgical landmarks, medical warnings, and guided camera navigation.
 */
export class LandmarksViewModel extends Observable {
  constructor(appVM) {
    super({
      activeLandmarkId: null,
      showLandmarkMarkers: true
    });
    this.appVM = appVM;
  }

  selectLandmark(landmarkId) {
    if (this.state.activeLandmarkId === landmarkId) {
      this.state.activeLandmarkId = null;
    } else {
      this.state.activeLandmarkId = landmarkId;
      const landmark = this.appVM.landmarksData.find(l => l.id === landmarkId);
      if (landmark) {
        // Also select corresponding organ and focus camera
        this.appVM.sceneVM.state.selectedOrganId = landmark.organId;
        this.appVM.sceneVM.state.cameraTarget = landmark.coordinates;
      }
    }
  }

  toggleMarkers() {
    this.state.showLandmarkMarkers = !this.state.showLandmarkMarkers;
  }
}
