import { AppViewModel } from './viewmodels/AppViewModel.js';
import { SceneView } from './views/SceneView.js';
import { UIView } from './views/UIView.js';

/**
 * app.js
 * Application Bootstrap for 3D Digestive System Anatomy.
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Digestive 3D] Khởi động ứng dụng...');

  try {
    const appVM = new AppViewModel();
    await appVM.initialize();

    const container = document.getElementById('canvas-container');
    if (!container) {
      throw new Error('Không tìm thấy phần tử #canvas-container');
    }

    const sceneView = new SceneView(
      container,
      appVM.sceneVM,
      appVM.dissectionVM,
      appVM.landmarksVM,
      appVM
    );

    const uiView = new UIView(appVM);

    // Lưu vào window để dễ dàng debug và tích hợp tự động
    window.__DIGESTIVE_APP__ = {
      appVM,
      sceneVM: appVM.sceneVM,
      dissectionVM: appVM.dissectionVM,
      landmarksVM: appVM.landmarksVM,
      sceneView,
      uiView
    };

    console.log('[Digestive 3D] Đã sẵn sàng! Sẵn sàng tương tác.');
  } catch (err) {
    console.error('[Digestive 3D] Lỗi khởi tạo ứng dụng:', err);
    const errBox = document.createElement('div');
    errBox.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;padding:12px 20px;border-radius:8px;z-index:9999;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    errBox.textContent = 'Lỗi khởi tạo: ' + err.message;
    document.body.appendChild(errBox);
  }
});
