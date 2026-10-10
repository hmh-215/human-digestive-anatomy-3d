import { Observable } from './Observable.js';
import { SceneViewModel } from './SceneViewModel.js';
import { DissectionViewModel } from './DissectionViewModel.js';
import { LandmarksViewModel } from './LandmarksViewModel.js';

/**
 * AppViewModel
 * Master coordinator for the entire Digestive 3D application.
 * Manages active mode ('dissection' | 'physiology' | 'pathology'),
 * data loading, theme, search queries, and sub-viewmodels.
 */
export class AppViewModel extends Observable {
  constructor() {
    super({
      isLoading: true,
      error: null,
      dataLoaded: false,
      activeMode: 'dissection', // 'dissection' | 'physiology' | 'pathology'
      activeNavTab: '3d_model', // '3d_model' | 'lectures'
      theme: 'light', // Light mode by default as requested
      searchQuery: ''
    });

    this.organsData = [];
    this.landmarksData = [];
    this.layersConfig = [];

    this.sceneVM = new SceneViewModel(this);
    this.dissectionVM = new DissectionViewModel(this);
    this.landmarksVM = new LandmarksViewModel(this);
  }

  async initialize() {
    this.state.isLoading = true;
    this.state.error = null;

    try {
      const [organsRes, landmarksRes, layersRes] = await Promise.all([
        fetch('./data/organs.json').then(r => r.json()),
        fetch('./data/clinical_landmarks.json').then(r => r.json()),
        fetch('./data/layers_config.json').then(r => r.json())
      ]);

      this.organsData = organsRes.organs || [];
      this.landmarksData = landmarksRes.landmarks || [];
      this.layersConfig = layersRes.layers || [];

      this.batch(() => {
        this.state.isLoading = false;
        this.state.dataLoaded = true;
      });
    } catch (err) {
      console.error('Failed to load anatomy data:', err);
      this.batch(() => {
        this.state.error = 'Lỗi tải cơ sở dữ liệu giải phẫu: ' + err.message;
        this.state.isLoading = false;
      });
    }
  }

  setMode(mode) {
    this.state.activeMode = mode;
  }

  setNavTab(tab) {
    this.state.activeNavTab = tab;
  }

  setSearchQuery(q) {
    this.state.searchQuery = q.trim();
  }

  toggleTheme() {
    this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
  }
}
