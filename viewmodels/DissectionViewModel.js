import { Observable } from './Observable.js';

/**
 * DissectionViewModel
 * Handles multi-tiered anatomical peeling, localized sub-assembly explosion,
 * isolation mode, and X-ray ghosting.
 */
export class DissectionViewModel extends Observable {
  constructor(appVM) {
    super({
      depthLevel: 1, // Mặc định hiển thị toàn thể từ Tầng 1
      visibleLayers: [1, 2, 3, 4, 5],
      localExplodeOrganId: null,
      localExplodeFactor: 0.0,
      isIsolateMode: false,
      isXRayMode: false,
      globalExplodeFactor: 0.0,
      isWindowingOpen: false,
      // Bóc tách 4 tầng mô học thành dạ dày (Stomach Wall Dissection)
      stomachWallLayers: {
        stomach_serosa: true,
        stomach_muscularis: true,
        stomach_submucosa: true,
        stomach_mucosa: true
      },
      stomachWallExplodeFactor: 0.0,
      activeWallLayerId: null
    });
    this.appVM = appVM;
  }

  setDepthLevel(level) {
    this.batch(() => {
      this.state.depthLevel = level;
      // Bóc tách giải phẫu y khoa: Bóc dần các tầng nông bên ngoài để bộc lộ tạng sâu
      // Tầng 1: Hiện toàn bộ từ nông đến sâu [1, 2, 3, 4, 5]
      // Tầng 2: Bóc tách Mạc nối & thực quản nông [2, 3, 4, 5]
      // Tầng 3: Bóc tách Gan & Dạ dày -> Bộc lộ rõ Khối Tá Tràng - Tụy Tạng & Đường mật [3, 4, 5]
      // Tầng 4: Bóc tách sâu cuống mạch [4, 5]
      // Tầng 5: Tầng sâu sau phúc mạc [5]
      const layers = [];
      for (let i = level; i <= 5; i++) {
        layers.push(i);
      }
      this.state.visibleLayers = layers;
    });
  }

  toggleLayer(layerNumber) {
    const current = [...this.state.visibleLayers];
    const idx = current.indexOf(layerNumber);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(layerNumber);
      current.sort((a, b) => a - b);
    }
    this.state.visibleLayers = current;
  }

  setLocalExplodeOrgan(organId) {
    this.batch(() => {
      this.state.localExplodeOrganId = organId;
      this.state.localExplodeFactor = 0.0;
    });
  }

  setLocalExplodeFactor(factor) {
    this.state.localExplodeFactor = Math.max(0, Math.min(1, factor));
  }

  toggleIsolateMode() {
    this.state.isIsolateMode = !this.state.isIsolateMode;
  }

  toggleXRayMode() {
    this.state.isXRayMode = !this.state.isXRayMode;
  }

  toggleWindowing() {
    this.state.isWindowingOpen = !this.state.isWindowingOpen;
  }

  toggleStomachWallLayer(layerId) {
    const updated = { ...this.state.stomachWallLayers };
    updated[layerId] = !updated[layerId];
    this.state.stomachWallLayers = updated;
  }

  setStomachWallLayerVisibility(layerId, isVisible) {
    const updated = { ...this.state.stomachWallLayers };
    updated[layerId] = isVisible;
    this.state.stomachWallLayers = updated;
  }

  setStomachWallExplodeFactor(factor) {
    this.state.stomachWallExplodeFactor = Math.max(0, Math.min(1, factor));
  }

  setActiveWallLayer(layerId) {
    this.state.activeWallLayerId = layerId;
  }

  peelToLayer(targetLayerId) {
    const updated = {
      stomach_serosa: false,
      stomach_muscularis: false,
      stomach_submucosa: false,
      stomach_mucosa: false
    };
    if (targetLayerId === 'all' || targetLayerId === 'stomach_serosa') {
      updated.stomach_serosa = true;
      updated.stomach_muscularis = true;
      updated.stomach_submucosa = true;
      updated.stomach_mucosa = true;
    } else if (targetLayerId === 'stomach_muscularis') {
      updated.stomach_muscularis = true;
      updated.stomach_submucosa = true;
      updated.stomach_mucosa = true;
    } else if (targetLayerId === 'stomach_submucosa') {
      updated.stomach_submucosa = true;
      updated.stomach_mucosa = true;
    } else if (targetLayerId === 'stomach_mucosa') {
      updated.stomach_mucosa = true;
    }
    this.state.stomachWallLayers = updated;
  }

  resetAll() {
    this.batch(() => {
      this.state.depthLevel = 1;
      this.state.visibleLayers = [1, 2, 3, 4, 5];
      this.state.localExplodeOrganId = null;
      this.state.localExplodeFactor = 0.0;
      this.state.isIsolateMode = false;
      this.state.isXRayMode = false;
      this.state.globalExplodeFactor = 0.0;
      this.state.isWindowingOpen = false;
      this.state.stomachWallLayers = {
        stomach_serosa: true,
        stomach_muscularis: true,
        stomach_submucosa: true,
        stomach_mucosa: true
      };
      this.state.stomachWallExplodeFactor = 0.0;
      this.state.activeWallLayerId = null;
    });
  }
}
