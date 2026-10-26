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
      this.appVM.sceneVM.selectOrgan(null);
      this.appVM.sceneVM.setCameraTarget([0.0, -0.15, 0.0], [0.0, 0.15, 9.8]);
    } else {
      this.state.activeLandmarkId = landmarkId;
      const landmark = this.appVM.landmarksData.find(l => l.id === landmarkId);
      if (landmark) {
        // Làm sáng cơ quan tương ứng (không explode)
        this.appVM.sceneVM.selectOrgan(landmark.organId);
        // Hướng camera tập trung vào điểm mốc và cơ quan liên quan
        if (landmark.cameraFocus) {
          this.appVM.sceneVM.setCameraTarget(landmark.coordinates, landmark.cameraFocus);
        } else {
          this.appVM.sceneVM.setCameraTarget(landmark.coordinates);
        }
      }
    }
    this.notify('activeLandmarkId', this.state.activeLandmarkId);
  }

  toggleMarkers() {
    this.state.showLandmarkMarkers = !this.state.showLandmarkMarkers;
  }
}
