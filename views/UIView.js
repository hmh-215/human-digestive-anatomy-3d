import { getOrganHeatmapRegions } from '../data/heatmapCatalog.js?v=20261117_v35';

/**
 * UIView.js
 * 2-Tab Context-Aware DOM UI Controller for Human Digestive Anatomy 3D.
 *
 * Features:
 * - Tab 1 (Toan He Thong): Whole-System 4-Row Knolling Catalog Grid
 * - Tab 2 (Co Lap Bo Phan): Isolated Organ Concentric Layer Telescoping (with auto-isolation)
 * - Per-Organ 50% Longitudinal Cutaway Toggle (works on any hollow organ)
 * - Single Unified Explode Slider (0% - 100%) + One-Click Animated Explode Button
 * - Medical Info Drawer (Right side) with ĐHYHN clinical & histological cards
 */
export class UIView {
  constructor(appVM) {
    this.appVM = appVM;
    this.sceneVM = appVM.sceneVM;
    this.dissectionVM = appVM.dissectionVM;
    this.landmarksVM = appVM.landmarksVM;

    this.dissectionDockEl = document.getElementById('dissection-dock');
    this.tabBtnSystem = document.getElementById('tab-btn-system');
    this.tabBtnOrgan = document.getElementById('tab-btn-organ');
    this.tabPaneSystem = document.getElementById('tab-pane-system');
    this.tabPaneOrgan = document.getElementById('tab-pane-organ');

    this.contextSubEl = document.getElementById('dock-context-sub');
    this.contextTitleEl = document.getElementById('dock-context-title');
    this.backSystemBtn = document.getElementById('btn-back-system');
    this.organChips = document.querySelectorAll('.organ-chip');

    this.explodeSlider = document.getElementById('unified-explode-slider');
    this.explodeValueBadge = document.getElementById('explode-value-badge');
    this.explodeModeLabel = document.getElementById('explode-mode-label');
    this.explodeHelperText = document.getElementById('explode-helper-text');
    this.animateExplodeBtn = document.getElementById('btn-animate-explode');

    this.cutawayBtn = document.getElementById('btn-stomach-cutaway');
    this.isolateBtn = document.getElementById('btn-isolate');
    this.toggleDisplayMode = document.getElementById('toggle-display-mode');
    this.labelModeLayers = document.getElementById('label-mode-layers');
    this.labelModeRegions = document.getElementById('label-mode-regions');
    this.resetCameraBtn = document.getElementById('btn-reset-camera');
    this.themeToggleBtn = document.getElementById('btn-theme-toggle');

    this.drawerEl = document.getElementById('organ-drawer');
    this.drawerTitleEl = document.getElementById('drawer-title');
    this.drawerLatinEl = document.getElementById('drawer-latin');
    this.drawerContentEl = document.getElementById('drawer-content');
    this.drawerCloseBtn = document.getElementById('drawer-close');

    this.searchInput = document.getElementById('organ-search');
    this.searchResultsBox = document.getElementById('search-results');

    this.modePills = document.querySelectorAll('.mode-pill');
    this.landmarksPanel = document.getElementById('landmarks-panel');

    this.torsoOpacitySlider = document.getElementById('torso-opacity-slider');
    this.torsoOpacityValue = document.getElementById('torso-opacity-value');

    this.navBtn3D = document.getElementById('nav-btn-3d') || document.getElementById('nav-btn-dissection');
    this.navBtnHelp = document.getElementById('nav-btn-help');
    this.btnHelpGo3D = document.getElementById('btn-help-go-3d');
    this.section3D = document.getElementById('section-3d-model');
    this.sectionHelp = document.getElementById('section-help');
    this.searchClearBtn = document.getElementById('btn-search-clear');

    this.portraitPanelToggleBtn = document.getElementById('portrait-panel-toggle');

    this._bindDOMEvents();
    this._bindViewModelEvents();
    this._renderLandmarksList();
    this._syncInitialSliders();
    this._initPortraitLayout();
  }

  _initPortraitLayout() {
    const mq = window.matchMedia('(max-width: 820px) and (orientation: portrait)');
    const applyOrientationClass = () => {
      const isPortrait = mq.matches;
      document.body.classList.toggle('layout-portrait', isPortrait);
      document.body.classList.toggle('layout-landscape', !isPortrait);
      document.body.dataset.activeMode = this.appVM.state.activeMode || 'dissection';
    };

    applyOrientationClass();
    if (mq.addEventListener) {
      mq.addEventListener('change', applyOrientationClass);
    } else if (mq.addListener) {
      mq.addListener(applyOrientationClass);
    }
    window.addEventListener('resize', applyOrientationClass);

    this._setPortraitView('canvas');
    this._setPortraitPopupOpen(false);

    if (this.portraitPanelToggleBtn) {
      this.portraitPanelToggleBtn.addEventListener('click', () => {
        const isExpanded = (document.body.dataset.portraitView === 'panel');
        this._setPortraitView(isExpanded ? 'canvas' : 'panel');
      });
    }

    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
      canvasContainer.addEventListener('canvas:part-tap', (e) => {
        if (!document.body.classList.contains('layout-portrait')) return;
        const payload = e.detail;
        if (!payload || !payload.organId) return;
        const organ = this.appVM.organsData.find(o => o.id === payload.organId);
        if (organ) {
          this._setPortraitView('canvas');
          this._showPortraitSinglePopup(organ, payload);
        }
      });

      canvasContainer.addEventListener('canvas:landmark-tap', (e) => {
        if (!document.body.classList.contains('layout-portrait')) return;
        const lm = e.detail;
        if (lm) {
          this._setPortraitView('canvas');
          this._showPortraitLandmarkPopup(lm);
        }
      });
    }
  }

  _setPortraitView(viewName) {
    const isPanel = (viewName === 'panel');
    document.body.dataset.portraitView = isPanel ? 'panel' : 'canvas';
    if (this.portraitPanelToggleBtn) {
      this.portraitPanelToggleBtn.setAttribute('aria-expanded', isPanel ? 'true' : 'false');
      this.portraitPanelToggleBtn.setAttribute('aria-label', isPanel ? 'Thu gọn bảng điều khiển' : 'Mở bảng điều khiển');
    }
    if (isPanel) {
      this._setPortraitPopupOpen(false);
    }
  }

  _setPortraitPopupOpen(isOpen) {
    document.body.dataset.portraitPopup = isOpen ? 'open' : 'closed';
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
      canvasContainer.dispatchEvent(new CustomEvent('portrait:popup-change', { detail: { isOpen } }));
    }
  }

  _syncInitialSliders() {
    if (this.torsoOpacitySlider) {
      const val = this.dissectionVM.state.torsoSkinOpacity ?? 0.5;
      const pct = Math.round(val * 100);
      this.torsoOpacitySlider.value = val;
      this.torsoOpacitySlider.style.setProperty('--progress', `${pct}%`);
      if (this.torsoOpacityValue) this.torsoOpacityValue.textContent = `${pct}%`;
    }
    if (this.explodeSlider) {
      const val = this.dissectionVM.state.explodeFactor ?? 0;
      const pct = Math.round(val * 100);
      this.explodeSlider.value = val;
      this.explodeSlider.style.setProperty('--progress', `${pct}%`);
      if (this.explodeValueBadge) this.explodeValueBadge.textContent = `${pct}%`;
    }
  }

  _setDockTabUI(tabName) {
    const isOrganTab = (tabName === 'organ');
    if (this.tabBtnSystem) {
      this.tabBtnSystem.classList.toggle('active', !isOrganTab);
      this.tabBtnSystem.classList.toggle('is-active', !isOrganTab);
    }
    if (this.tabBtnOrgan) {
      this.tabBtnOrgan.classList.toggle('active', isOrganTab);
      this.tabBtnOrgan.classList.toggle('is-active', isOrganTab);
    }
    if (this.tabPaneSystem) this.tabPaneSystem.classList.toggle('hidden', isOrganTab);
    if (this.tabPaneOrgan) this.tabPaneOrgan.classList.toggle('hidden', !isOrganTab);
  }

  _setNavTab(tabName) {
    const isHelp = (tabName === 'help');

    if (this.navBtn3D) {
      this.navBtn3D.classList.toggle('active', !isHelp);
      this.navBtn3D.classList.toggle('is-active', !isHelp);
      this.navBtn3D.setAttribute('aria-selected', !isHelp ? 'true' : 'false');
    }
    if (this.navBtnHelp) {
      this.navBtnHelp.classList.toggle('active', isHelp);
      this.navBtnHelp.classList.toggle('is-active', isHelp);
      this.navBtnHelp.setAttribute('aria-selected', isHelp ? 'true' : 'false');
    }

    if (this.section3D) this.section3D.classList.toggle('hidden', isHelp);
    if (this.sectionHelp) this.sectionHelp.classList.toggle('hidden', !isHelp);

    if (isHelp) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  _bindDOMEvents() {
    // Nav Tabs: Mô hình 3D vs Trợ Giúp
    if (this.navBtn3D) {
      this.navBtn3D.addEventListener('click', () => this._setNavTab('3d'));
    }
    if (this.navBtnHelp) {
      this.navBtnHelp.addEventListener('click', () => this._setNavTab('help'));
    }
    if (this.btnHelpGo3D) {
      this.btnHelpGo3D.addEventListener('click', () => this._setNavTab('3d'));
    }

    // 0. Task 1: 2-Tab Switcher (Tab 1: Whole System Knolling vs. Tab 2: Isolated Organ)
    if (this.tabBtnSystem) {
      this.tabBtnSystem.addEventListener('click', () => {
        this._setDockTabUI('system');
        this.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0 });
        this.sceneVM.resetCamera();
        this.sceneVM.selectOrgan(null);
      });
    }

    if (this.tabBtnOrgan) {
      this.tabBtnOrgan.addEventListener('click', () => {
        this._setDockTabUI('organ');
        this.dissectionVM.setState({ isIsolateMode: true, explodeFactor: 0 });
        const currentOrgan = this.sceneVM.state.selectedOrganId || 'stomach';
        this.sceneVM.selectOrgan(currentOrgan);
      });
    }

    // 1. Unified Context-Aware Explode Slider
    if (this.explodeSlider) {
      this.explodeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.explodeSlider.style.setProperty('--progress', `${Math.round(val * 100)}%`);
        this.dissectionVM.setExplodeFactor(val);
      });
    }

    // 2. One-Click Smooth Animated Explode Toggle Button
    if (this.animateExplodeBtn) {
      this.animateExplodeBtn.addEventListener('click', () => {
        if (window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView) {
          window.__DIGESTIVE_APP__.sceneView.animateToggleExplode();
        }
      });
    }

    // 3. Back to Whole System Button
    if (this.backSystemBtn) {
      this.backSystemBtn.addEventListener('click', () => {
        this._setDockTabUI('system');
        this.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0 });
        this.sceneVM.resetCamera();
        this.sceneVM.selectOrgan(null);
      });
    }

    // 4. Quick Organ Chips & Body Pins (Tab 2)
    this.organChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const organId = chip.dataset.organ || null;
        if (!organId) {
          this._setDockTabUI('system');
          this.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0 });
          this.sceneVM.resetCamera();
          this.sceneVM.selectOrgan(null);
        } else {
          this._setDockTabUI('organ');
          this.dissectionVM.setState({ isIsolateMode: true });
          this.sceneVM.selectOrgan(organId);
        }
      });
    });

    // 5. Task 2: Per-Organ 50% Longitudinal Cutaway Toggle (works on any hollow organ!)
    if (this.cutawayBtn) {
      this.cutawayBtn.addEventListener('click', () => {
        this.dissectionVM.toggleCutaway();
      });
    }

    // 6. Isolate Mode Toggle
    if (this.isolateBtn) {
      this.isolateBtn.addEventListener('click', () => {
        this.dissectionVM.toggleIsolateMode();
      });
    }

    // 7. Organ Display Mode Switcher (Compact Switch: Layers <-> Regions)
    if (this.toggleDisplayMode) {
      this.toggleDisplayMode.addEventListener('change', (e) => {
        this.dissectionVM.setOrganDisplayMode(e.target.checked ? 'regions' : 'layers');
      });
    }
    if (this.labelModeLayers) {
      this.labelModeLayers.addEventListener('click', () => {
        this.dissectionVM.setOrganDisplayMode('layers');
      });
    }
    if (this.labelModeRegions) {
      this.labelModeRegions.addEventListener('click', () => {
        this.dissectionVM.setOrganDisplayMode('regions');
      });
    }

    // 8. Reset Camera (Reset view)
    if (this.resetCameraBtn) {
      this.resetCameraBtn.addEventListener('click', () => {
        this._setDockTabUI('system');
        this.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0 });
        this.sceneVM.resetCamera();
        this.sceneVM.selectOrgan(null);
      });
    }

    // 9. Theme Toggle
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => {
        this.appVM.toggleTheme();
      });
    }

    // 10. Close Drawer via X button, empty canvas tap/click, or Escape key
    if (this.drawerCloseBtn) {
      this.drawerCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hideOrganDrawer();
      });
    }
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
      canvasContainer.addEventListener('canvas:empty-click', () => {
        this._hideOrganDrawer();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.drawerEl && this.drawerEl.classList.contains('open')) {
        this._hideOrganDrawer();
      }
    });

    // 11. Search Bar & Clear Button
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (this.searchClearBtn) {
          this.searchClearBtn.classList.toggle('hidden', !q);
        }
        this._handleSearch(q);
      });
    }
    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        if (this.searchInput) {
          this.searchInput.value = '';
          this.searchInput.focus();
        }
        this.searchClearBtn.classList.add('hidden');
        if (this.searchResultsBox) {
          this.searchResultsBox.classList.add('hidden');
          this.searchResultsBox.innerHTML = '';
        }
      });
    }

    // 12. Mode Switcher (Dissection vs. Clinical Landmarks)
    this.modePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const mode = pill.dataset.mode;
        if (mode === 'pathology') {
          if (window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView && window.__DIGESTIVE_APP__.sceneView.explosionManager) {
            window.__DIGESTIVE_APP__.sceneView.explosionManager.stopAnimation();
          }
          this.dissectionVM.setExplodeFactor(0.0);
          this.dissectionVM.setCutawayOpen(false);
          this.dissectionVM.setState({
            isIsolateMode: false,
            visibleLayers: [1, 2, 3],
            activeWallLayerId: null
          });
          this.sceneVM.selectOrgan(null);
        }
        this.appVM.setMode(mode);
      });
    });

    // 13. Torso Skin Opacity Slider (Mode 2)
    if (this.torsoOpacitySlider) {
      this.torsoOpacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.torsoOpacitySlider.style.setProperty('--progress', `${Math.round(val * 100)}%`);
        this.dissectionVM.setTorsoSkinOpacity(val);
      });
    }

    // 14. Quick Aspect Toggles (Front vs. Back)
    this.viewFrontBtn = document.getElementById('btn-view-front');
    this.viewBackBtn = document.getElementById('btn-view-back');
    if (this.viewFrontBtn) {
      this.viewFrontBtn.addEventListener('click', () => {
        this.sceneVM.setCameraTarget([0.0, -0.15, 0.0], [0.0, 0.15, 9.8]);
      });
    }
    if (this.viewBackBtn) {
      this.viewBackBtn.addEventListener('click', () => {
        this.sceneVM.setCameraTarget([0.0, -0.15, 0.0], [0.0, 0.15, -9.8]);
      });
    }
  }

  _bindViewModelEvents() {
    // 1. Update 2-Tab state, Context Header, Explode Labels, and Right Info Drawer on Organ Selection
    this.sceneVM.subscribe('selectedOrganId', (organId) => {
      this.organChips.forEach((chip) => {
        const chipOrgan = chip.dataset.organ || null;
        chip.classList.toggle('active', chipOrgan === organId);
      });

      if (organId) {
        if (this.appVM.state.activeMode === 'pathology') {
          // Trong chế độ mốc lâm sàng: giữ màn hình thông thoáng, không che lấp tầm nhìn thân mình
          this._hideOrganDrawer();
          return;
        }

        // Selecting an organ activates Tab 2 (Isolated Organ Mode) and enables Isolate Mode
        this._setDockTabUI('organ');
        if (!this.dissectionVM.state.isIsolateMode) {
          this.dissectionVM.setState({ isIsolateMode: true });
        }

        const organ = this.appVM.organsData.find(o => o.id === organId);
        if (organ) {
          if (this.contextSubEl) this.contextSubEl.textContent = 'CHẾ ĐỘ CÔ LẬP TỪNG BỘ PHẬN';
          this.contextTitleEl.textContent = organ.vietnameseName;
          this.backSystemBtn.classList.remove('hidden');

          if (organId === 'stomach') {
            this.explodeModeLabel.textContent = 'Tách Lớp Dạ Dày:';
            this.explodeHelperText.textContent = 'Các lớp trong tiến về phía người xem, nằm gọn trong lòng lớp ngoài tương ứng';
          } else if (organId === 'esophagus') {
            this.explodeModeLabel.textContent = 'Tách Lớp Thực Quản:';
            this.explodeHelperText.textContent = 'Vỏ xơ Adventitia → Cơ dọc → Cơ vòng → Dưới niêm mạc → Biểu mô lát tầng';
          } else if (organId === 'duodenum') {
            this.explodeModeLabel.textContent = 'Tách Lớp Tá Tràng:';
            this.explodeHelperText.textContent = 'Thanh mạc → Cơ dọc → Cơ vòng → Tuyến Brunner dưới niêm → Nếp vòng Kerckring';
          } else if (organId === 'small_intestine') {
            this.explodeModeLabel.textContent = 'Tách Lớp Ruột Non:';
            this.explodeHelperText.textContent = 'Thanh mạc → Cơ dọc Auerbach → Cơ vòng → Dưới niêm mạc → Nhung mao Villi';
          } else if (organId === 'large_intestine') {
            this.explodeModeLabel.textContent = 'Tách Lớp Đại Tràng:';
            this.explodeHelperText.textContent = 'Từ trong ra ngoài: Niêm mạc → Dưới niêm → Cơ vòng & Cơ dọc → Thanh mạc';
          } else if (organId === 'gallbladder_tree') {
            this.explodeModeLabel.textContent = 'Tách Lớp Túi Mật & Đường Mật:';
            this.explodeHelperText.textContent = 'Thanh mạc & mô xơ quanh cơ → Lớp cơ trơn → Lớp đệm Lamina propria → Niêm mạc tổ ong';
          } else if (organId === 'liver') {
            this.explodeModeLabel.textContent = 'Phân Tách 8 Hạ Phân Thùy Gan:';
            this.explodeHelperText.textContent = 'Tách rời 8 hạ phân thùy gan (I → VIII) với nhu mô gan sắc nét';
          } else if (organId === 'portal_system') {
            this.explodeModeLabel.textContent = 'Hệ Tĩnh Mạch Cửa Gan:';
            this.explodeHelperText.textContent = 'TMC hợp bởi TM mạc treo tràng trên & TM tỳ, chia nhánh vào 8 hạ phân thùy gan';
          } else if (organId === 'hepatic_artery') {
            this.explodeModeLabel.textContent = 'Động Mạch Thân Tạng & Gan:';
            this.explodeHelperText.textContent = 'Thân tạng → ĐM gan chung → ĐM gan riêng chia 2 ngành P/T cấp máu dinh dưỡng gan';
          } else if (organId === 'hepatic_veins') {
            this.explodeModeLabel.textContent = 'Các Tĩnh Mạch Gan:';
            this.explodeHelperText.textContent = '3 tĩnh mạch gan (Phải, Giữa, Trái) dẫn lưu máu khử oxy từ các hạ phân thùy gan đổ trực tiếp vào TMC dưới';
          } else if (organId === 'oral_cavity') {
            this.explodeModeLabel.textContent = 'Vùng Miệng & Hầu:';
            this.explodeHelperText.textContent = 'Bấm "Mặt Cắt Dọc 50%" để xem mặt phẳng cắt dọc chính giữa mặt qua răng, cơ lưỡi và 3 tầng thành hầu';
          } else if (organId === 'pharynx') {
            this.explodeModeLabel.textContent = 'Hệ Thống Hầu - Họng:';
            this.explodeHelperText.textContent = 'Tỵ hầu → Khẩu hầu → Thanh hầu nối tiếp miệng thực quản tại C6';
          } else if (organId === 'tongue') {
            this.explodeModeLabel.textContent = 'Lưỡi:';
            this.explodeHelperText.textContent = 'Khối cơ vân linh hoạt đảm nhiệm nhai, đảo thức ăn, nuốt và thụ cảm vị giác';
          } else if (organId === 'teeth_and_jaw') {
            this.explodeModeLabel.textContent = 'Cung Răng & Khung Xương Hàm:';
            this.explodeHelperText.textContent = 'Bộ 32 răng vĩnh viễn cắm sâu vào cung huyệt răng của xương hàm trên và xương hàm dưới';
          } else if (organId === 'salivary_glands') {
            this.explodeModeLabel.textContent = 'Tuyến Nước Bọt:';
            this.explodeHelperText.textContent = '3 cặp tuyến đối xứng: Tuyến mang tai, Tuyến dưới hàm, Tuyến dưới lưỡi';
          } else {
            this.explodeModeLabel.textContent = `Tách Cấu Trúc ${organ.vietnameseName}:`;
            this.explodeHelperText.textContent = 'Tách rời các cấu trúc con để rê chuột xem nhãn giải phẫu chi tiết';
          }

          if (document.body.classList.contains('layout-portrait')) {
            // In Portrait mode, selecting via Body Map/Search collapses the panel to reveal full 3D organ;
            // tapping directly on the 3D organ drops the red dot and opens the 1/3 single-item popup.
            this._setPortraitView('canvas');
          } else {
            this._showOrganDrawer(organ);
          }
        }
      } else {
        this._setDockTabUI('system');
        if (this.contextSubEl) this.contextSubEl.textContent = 'CHẾ ĐỘ TOÀN HỆ THỐNG';
        this.contextTitleEl.textContent = 'Toàn Hệ Tiêu Hóa';
        this.backSystemBtn.classList.add('hidden');
        this.explodeModeLabel.textContent = 'Xếp Hàng Toàn Hệ Thống:';
        this.explodeHelperText.textContent = 'Kéo thanh trượt hoặc bấm nút để xếp toàn bộ cơ quan & lớp mô học theo 4 hàng ngang';
        this._hideOrganDrawer();
        if (document.body.classList.contains('layout-portrait')) {
          this._setPortraitView('canvas');
        }
      }
    });

    // 2. Sync Unified Explode Slider & Trigger Button Label
    this.dissectionVM.subscribe('explodeFactor', (factor) => {
      const pct = Math.round((factor || 0) * 100);
      if (this.explodeSlider) {
        this.explodeSlider.value = factor || 0;
        this.explodeSlider.style.setProperty('--progress', `${pct}%`);
      }
      if (this.explodeValueBadge) this.explodeValueBadge.textContent = `${pct}%`;
      if (this.animateExplodeBtn) {
        const isExpanded = factor > 0.3;
        this.animateExplodeBtn.classList.toggle('active', isExpanded);
        this.animateExplodeBtn.classList.toggle('is-active', isExpanded);
        this.animateExplodeBtn.textContent = isExpanded ? 'Thu Gọn' : 'Tách Lớp';
      }
    });

    // 3. Sync Isolate, X-Ray, and Cutaway button states
    this.dissectionVM.subscribe('isIsolateMode', (isIsolate) => {
      if (this.isolateBtn) {
        this.isolateBtn.classList.toggle('active', isIsolate);
        this.isolateBtn.textContent = isIsolate ? 'Bỏ Cô Lập' : 'Cô Lập';
        this.isolateBtn.title = isIsolate ? 'Đang ẩn hoàn toàn cơ quan khác. Bấm để hiển thị dạng mờ (transparent)' : 'Đang hiện mờ cơ quan khác. Bấm để ẩn hoàn toàn';
      }
    });

    this.dissectionVM.subscribe('isCutawayOpen', (isOpen) => {
      if (this.cutawayBtn) {
        this.cutawayBtn.classList.toggle('active', isOpen);
        this.cutawayBtn.textContent = isOpen ? 'Đóng Mặt Cắt' : 'Mặt Cắt Dọc 50%';
      }
    });

    // 3b. Sync Organ Display Mode (Compact Switch: Layers vs Regions)
    this.dissectionVM.subscribe('organDisplayMode', (mode) => {
      const isLayers = (mode === 'layers');
      if (this.toggleDisplayMode) {
        this.toggleDisplayMode.checked = !isLayers;
      }
      if (this.labelModeLayers) {
        this.labelModeLayers.classList.toggle('active', isLayers);
      }
      if (this.labelModeRegions) {
        this.labelModeRegions.classList.toggle('active', !isLayers);
      }

      // Hide explode control card in regions mode (no exploding in heatmap mode)
      const explodeCard = document.querySelector('.explode-control-card');
      if (explodeCard) {
        explodeCard.classList.toggle('hidden', !isLayers);
      }

      // In heatmap mode, ensure explode factor is reset to 0
      if (!isLayers && (this.dissectionVM.state.explodeFactor || 0) > 0) {
        this.dissectionVM.setExplodeFactor(0);
      }

      if (this.explodeHelperText) {
        if (!isLayers) {
          this.explodeHelperText.textContent = 'Chế độ Phân Vùng: Chạm hoặc rê chuột lên cơ quan để ghim điểm mô tả phân vùng chức năng';
        }
      }

      // Refresh right drawer immediately so toggling Mô Học <-> Phân Vùng switches layer vs heatmap sections
      const selectedId = this.sceneVM.state.selectedOrganId;
      if (selectedId && this.drawerEl && this.drawerEl.classList.contains('open')) {
        const organ = this.appVM.organsData.find(o => o.id === selectedId);
        if (organ) this._showOrganDrawer(organ);
      }
    });

    // 4. Sync Active Wall Layer Card & Compact Pills in Right Drawer
    this.dissectionVM.subscribe('activeWallLayerId', (layerId) => {
      if (!layerId) return;
      const targetCard = document.getElementById(`card-${layerId}`);
      document.querySelectorAll('.wall-layer-card').forEach(card => {
        const isMatch = (card.id === `card-${layerId}`);
        card.classList.toggle('highlight', isMatch);
        card.classList.toggle('is-active', isMatch);
      });
      document.querySelectorAll('.mobile-layer-pill[data-layer-id]').forEach(pill => {
        const isMatch = (pill.dataset.layerId === layerId);
        pill.classList.toggle('is-active', isMatch);
        pill.classList.toggle('active', isMatch);
      });
      if (targetCard && !this.drawerContentEl.classList.contains('portrait-single-popup')) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    // 4b. Sync Active Heatmap Region Card in Right Drawer when hovering/tapping 3D heatmap
    this.sceneVM.subscribe('hoveredPart', (payload) => {
      if (!payload || !payload.regionKey) return;
      if (this.dissectionVM.state.organDisplayMode !== 'regions') return;
      this._setActiveHeatmapRegionCard(payload.regionKey);
    });

    // 5. Sync Torso Opacity Slider
    this.dissectionVM.subscribe('torsoSkinOpacity', (val) => {
      const pct = Math.round((val || 0) * 100);
      if (this.torsoOpacitySlider) {
        this.torsoOpacitySlider.value = val;
        this.torsoOpacitySlider.style.setProperty('--progress', `${pct}%`);
      }
      if (this.torsoOpacityValue) this.torsoOpacityValue.textContent = `${pct}%`;
    });

    // 6. Theme Toggle (Cố định Light Theme Y Khoa)
    this.appVM.subscribe('theme', (theme) => {
      document.body.classList.remove('dark-theme');
      if (this.themeToggleBtn) {
        this.themeToggleBtn.innerHTML = 'Giao Diện Sáng';
      }
    });

    // 7. Mode Switcher (Ensure Landmarks Panel and Dissection Dock NEVER overlap)
    this.appVM.subscribe('activeMode', (mode) => {
      if (this.navBtnDissection) {
        this.navBtnDissection.classList.toggle('active', mode === 'dissection');
        this.navBtnDissection.classList.toggle('is-active', mode === 'dissection');
      }
      if (this.navBtnLandmarks) {
        this.navBtnLandmarks.classList.toggle('active', mode === 'pathology');
        this.navBtnLandmarks.classList.toggle('is-active', mode === 'pathology');
      }
      if (this.navBtnHelp) {
        this.navBtnHelp.classList.remove('active', 'is-active');
      }

      this.modePills.forEach(p => {
        const isMatch = p.dataset.mode === mode;
        p.classList.toggle('active', isMatch);
        p.classList.toggle('is-active', isMatch);
      });
      if (mode === 'pathology') {
        this.landmarksPanel.classList.remove('hidden');
        if (this.dissectionDockEl) this.dissectionDockEl.classList.add('hidden');
        this._hideOrganDrawer();
      } else {
        this.landmarksPanel.classList.add('hidden');
        if (this.dissectionDockEl) this.dissectionDockEl.classList.remove('hidden');
      }
      document.body.dataset.activeMode = mode;
      this._setPortraitView('canvas');
      this._setPortraitPopupOpen(false);
    });

    // 8. Sync Active Landmark in Left List when selected (from list or direct 3D pin click)
    this.landmarksVM.subscribe('activeLandmarkId', (activeId) => {
      const listContainer = document.getElementById('landmarks-list');
      if (!listContainer) return;
      listContainer.querySelectorAll('.landmark-card').forEach(card => {
        const isMatch = (card.dataset.id === activeId);
        card.classList.toggle('active', isMatch);
        card.classList.toggle('is-active', isMatch);
        if (isMatch) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }

  _setActiveHeatmapRegionCard(regionKey) {
    if (!this.drawerContentEl || !regionKey) return;
    this.drawerContentEl.querySelectorAll('.heatmap-region-card').forEach(card => {
      const isMatch = (card.dataset.regionKey === regionKey);
      card.classList.toggle('is-active', isMatch);
      card.classList.toggle('active', isMatch);
    });
    this.drawerContentEl.querySelectorAll('.mobile-layer-pill[data-region-key]').forEach(pill => {
      const isMatch = (pill.dataset.regionKey === regionKey);
      pill.classList.toggle('is-active', isMatch);
      pill.classList.toggle('active', isMatch);
    });
  }

  _showPortraitSinglePopup(organ, payload) {
    this.drawerTitleEl.textContent = organ.vietnameseName;
    this.drawerLatinEl.textContent = `${organ.latinName} • ${organ.englishName}`;
    this.drawerContentEl.classList.remove('drawer-focused-layers', 'drawer-focused-regions');
    this.drawerContentEl.classList.add('portrait-single-popup');

    // 1. Tapped a Functional Heatmap region -> render ONLY that 1 region
    if (payload.regionKey) {
      const regions = getOrganHeatmapRegions(organ.id) || [];
      const reg = regions.find(r => r.key === payload.regionKey);
      if (reg) {
        this.drawerContentEl.innerHTML = `
          <div class="heatmap-region-card is-active" style="--region-color: ${reg.color};">
            <div class="heatmap-region-header">
              <span class="heatmap-region-title">
                <span class="layer-dot" style="background: ${reg.color};"></span>
                ${reg.title}
              </span>
              <span class="wall-layer-thickness-badge">${reg.badge}</span>
            </div>
            <div class="heatmap-region-desc">${reg.subtitle}</div>
          </div>
        `;
        this.drawerEl.classList.add('open');
        this.drawerContentEl.scrollTop = 0;
        this._setPortraitPopupOpen(true);
        return;
      }
    }

    // 2. Tapped a Histological Wall Layer -> render ONLY that 1 tapped layer (no stacked Lớp 2, Lớp 3...)
    if (payload.wallLayerId && organ.wallLayers && organ.wallLayers.length > 0) {
      const orderedLayers = [...organ.wallLayers].reverse();
      const idx = orderedLayers.findIndex(l => l.id === payload.wallLayerId);
      const layer = idx >= 0 ? orderedLayers[idx] : orderedLayers[0];
      const posBadge = idx === 0
        ? 'Trong cùng'
        : (idx === orderedLayers.length - 1 ? 'Ngoài cùng' : `Tầng ${idx + 1}/${orderedLayers.length}`);
      this.drawerContentEl.innerHTML = `
        <div class="wall-layer-card is-active highlight" id="card-${layer.id}" data-layer-id="${layer.id}">
          <div class="wall-layer-card-header">
            <span class="wall-layer-card-title">
              <span class="layer-dot" style="background: ${layer.color};"></span>
              ${layer.name}
            </span>
            <span class="wall-layer-thickness-badge">${posBadge} • ${layer.thickness}</span>
          </div>
          <div class="wall-sub-block"><strong>Đại thể:</strong> ${layer.description}</div>
          <div class="wall-sub-block"><strong>Mô học vi thể:</strong> ${layer.histology}</div>
          <div class="wall-sub-block"><strong>Sinh lý:</strong> ${layer.physiology}</div>
          <div class="wall-clinical-sub"><strong>Lâm sàng ĐHYHN:</strong> ${layer.clinicalNotes}</div>
        </div>
      `;
      this.drawerEl.classList.add('open');
      this.drawerContentEl.scrollTop = 0;
      this._setPortraitPopupOpen(true);
      return;
    }

    // 3. Tapped an Organ or Sub-Part directly -> render ONLY 1 focused card for that tapped part
    this.drawerContentEl.innerHTML = `
      <div class="heatmap-region-card is-active" style="--region-color: ${payload.color || '#c8102e'};">
        <div class="heatmap-region-header">
          <span class="heatmap-region-title">
            <span class="layer-dot" style="background: ${payload.color || '#c8102e'};"></span>
            ${payload.title || organ.vietnameseName}
          </span>
          ${payload.badge ? `<span class="wall-layer-thickness-badge">${payload.badge}</span>` : ''}
        </div>
        <div class="heatmap-region-desc">${organ.structure || payload.subtitle || ''}</div>
        ${organ.clinicalNotes ? `<div class="wall-clinical-sub" style="margin-top:6px;"><strong>Lâm sàng ĐHYHN:</strong> ${organ.clinicalNotes}</div>` : ''}
      </div>
    `;
    this.drawerEl.classList.add('open');
    this.drawerContentEl.scrollTop = 0;
    this._setPortraitPopupOpen(true);
  }

  _showPortraitLandmarkPopup(lm) {
    this.drawerTitleEl.textContent = lm.name;
    this.drawerLatinEl.textContent = lm.category || 'ĐIỂM MỐC LÂM SÀNG';
    this.drawerContentEl.classList.remove('drawer-focused-layers', 'drawer-focused-regions');
    this.drawerContentEl.classList.add('portrait-single-popup');
    this.drawerContentEl.innerHTML = `
      <div class="landmark-card is-active">
        <p style="font-size: 12px; line-height: 1.45; color: var(--ink-soft); margin-bottom: 6px;">${lm.description}</p>
        ${lm.clinicalSignificance ? `
          <div class="wall-clinical-sub">
            <strong>Ý Nghĩa Khám & Dấu Hiệu:</strong> ${lm.clinicalSignificance}
          </div>
        ` : ''}
      </div>
    `;
    this.drawerEl.classList.add('open');
    this._setPortraitPopupOpen(true);
  }

  _showOrganDrawer(organ) {
    this.drawerContentEl.classList.remove('portrait-single-popup');
    this.drawerTitleEl.textContent = organ.vietnameseName;
    this.drawerLatinEl.textContent = `${organ.latinName} • ${organ.englishName}`;

    const isRegionsMode = (this.dissectionVM.state.organDisplayMode === 'regions');
    const heatmapRegions = isRegionsMode ? getOrganHeatmapRegions(organ.id) : null;

    let subListHtml = '';
    if (organ.subComponents && organ.subComponents.length > 0) {
      subListHtml = `
        <div class="drawer-section">
          <h4>Cấu Trúc Con Phân Rã (${organ.subComponents.length} thành phần):</h4>
          <div class="sub-tags">
            ${organ.subComponents.map(s => `<span class="tag-chip">${s.name}</span>`).join('')}
          </div>
        </div>
      `;
    }

    let primarySectionHtml = '';
    let hasFocusedCards = false;
    this.drawerContentEl.classList.remove('drawer-focused-layers', 'drawer-focused-regions');

    if (isRegionsMode && heatmapRegions && heatmapRegions.length > 0) {
      hasFocusedCards = true;
      this.drawerContentEl.classList.add('drawer-focused-regions');
      const hoveredKey = this.sceneVM.state.hoveredPart && this.sceneVM.state.hoveredPart.organId === organ.id
        ? this.sceneVM.state.hoveredPart.regionKey
        : null;
      const activeRegionKey = hoveredKey || heatmapRegions[0].key;

      primarySectionHtml = `
        <div class="drawer-section">
          <h4 style="color: #c8102e;">Phân Vùng Chức Năng (${heatmapRegions.length} vùng):</h4>
          <p style="font-size: 11px; margin-bottom: 8px; color: var(--text-muted);">
            Màu sắc từng phân đoạn trùng khớp 100% với mô hình 3D. Bấm vào vùng để ghim mốc trên 3D:
          </p>
          <div class="mobile-layer-pills">
            ${heatmapRegions.map((r, idx) => {
              const shortLabel = r.title.split('(')[0].trim();
              const isAct = (r.key === activeRegionKey);
              return `
                <button type="button" class="mobile-layer-pill ${isAct ? 'is-active' : ''}" data-region-key="${r.key}">
                  <span class="mobile-layer-pill-dot" style="background: ${r.color};"></span>
                  <span>${idx + 1}. ${shortLabel}</span>
                </button>
              `;
            }).join('')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${heatmapRegions.map((r) => {
              const isAct = (r.key === activeRegionKey);
              return `
                <div class="heatmap-region-card ${isAct ? 'is-active' : ''}" data-region-key="${r.key}" style="--region-color: ${r.color};">
                  <div class="heatmap-region-header">
                    <span class="heatmap-region-title">
                      <span class="layer-dot" style="background: ${r.color};"></span>
                      ${r.title}
                    </span>
                    <span class="wall-layer-thickness-badge">${r.badge}</span>
                  </div>
                  <div class="heatmap-region-desc">${r.subtitle}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (organ.wallLayers && organ.wallLayers.length > 0) {
      hasFocusedCards = true;
      this.drawerContentEl.classList.add('drawer-focused-layers');
      // Display wall layers ordered from INSIDE to OUTSIDE (Mucosa > Submucosa > Stratum > Serosa)
      const orderedLayers = [...organ.wallLayers].reverse();
      const activeLayerId = this.dissectionVM.state.activeWallLayerId || orderedLayers[0].id;

      primarySectionHtml = `
        <div class="drawer-section">
          <h4 style="color: #e11d48; display: flex; align-items: center; gap: 6px;">
            Cấu Tạo Mô Học Thành ${organ.vietnameseName} (Trong → Ngoài: ${organ.wallLayers.length} Lớp):
          </h4>
          <p style="font-size: 11px; margin-bottom: 8px; color: var(--text-muted);">
            Thứ tự từ <strong>Trong ra Ngoài</strong>. Bấm vào từng tầng để làm sáng lớp 3D:
          </p>
          <div class="mobile-layer-pills">
            ${orderedLayers.map((l, idx) => {
              const isAct = (l.id === activeLayerId);
              const shortPrefix = l.name.includes(':') ? l.name.split(':')[0].trim() : `Lớp ${idx + 1}`;
              return `
                <button type="button" class="mobile-layer-pill ${isAct ? 'is-active' : ''}" data-layer-id="${l.id}">
                  <span class="mobile-layer-pill-dot" style="background: ${l.color};"></span>
                  <span>${shortPrefix}</span>
                </button>
              `;
            }).join('')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${orderedLayers.map((l, idx) => {
              const isAct = (l.id === activeLayerId);
              const posBadge = idx === 0
                ? 'Trong cùng'
                : (idx === orderedLayers.length - 1 ? 'Ngoài cùng' : `Tầng ${idx + 1}/${orderedLayers.length}`);
              return `
              <div class="wall-layer-card ${isAct ? 'is-active highlight' : ''}" id="card-${l.id}" data-layer-id="${l.id}">
                <div class="wall-layer-card-header">
                  <span class="wall-layer-card-title">
                    <span class="layer-dot" style="background: ${l.color};"></span>
                    ${l.name}
                  </span>
                  <span class="wall-layer-thickness-badge">${posBadge} • ${l.thickness}</span>
                </div>
                <div class="wall-sub-block">
                  <strong>Đại thể:</strong> ${l.description}
                </div>
                <div class="wall-sub-block">
                  <strong>Mô học vi thể:</strong> ${l.histology}
                </div>
                <div class="wall-sub-block">
                  <strong>Sinh lý:</strong> ${l.physiology}
                </div>
                <div class="wall-clinical-sub">
                  <strong>Lâm sàng ĐHYHN:</strong> ${l.clinicalNotes}
                </div>
              </div>
            `;
            }).join('')}
          </div>
        </div>
      `;
    }

    this.drawerContentEl.innerHTML = `
      <div class="drawer-badge">Tầng Giải Phẫu: ${organ.layer}</div>
      ${primarySectionHtml}
      ${hasFocusedCards ? '<button type="button" class="drawer-overview-toggle">Xem Tổng Quan Cơ Quan</button>' : ''}
      <div class="drawer-overview-group ${hasFocusedCards ? 'is-collapsed-mobile' : ''}">
        <div class="drawer-section">
          <h4>Vị Trí & Liên Quan Giải Phẫu:</h4>
          <p>${organ.location}</p>
        </div>
        <div class="drawer-section">
          <h4>Hình Thể Ngoài & Cấu Trúc Trong:</h4>
          <p>${organ.structure}</p>
        </div>
        ${subListHtml}
        <div class="drawer-section">
          <h4>Mạch Máu & Thần Kinh Chi Phối:</h4>
          <p>${organ.vasculature}</p>
        </div>
        <div class="drawer-section">
          <h4>Chức Năng Tiêu Hóa Sinh Lý:</h4>
          <p>${organ.physiology}</p>
        </div>
        <div class="drawer-section highlight-box">
          <h4>Ý Nghĩa Ngoại Khoa & Lâm Sàng (ĐHYHN):</h4>
          <p>${organ.clinicalNotes}</p>
        </div>
      </div>
    `;

    const overviewToggle = this.drawerContentEl.querySelector('.drawer-overview-toggle');
    const overviewGroup = this.drawerContentEl.querySelector('.drawer-overview-group');
    if (overviewToggle && overviewGroup) {
      overviewToggle.addEventListener('click', () => {
        const collapsed = overviewGroup.classList.toggle('is-collapsed-mobile');
        overviewToggle.textContent = collapsed ? 'Xem Tổng Quan Cơ Quan' : 'Thu Gọn Tổng Quan';
      });
    }

    const selectLayerHandler = (layerId) => {
      if ((this.dissectionVM.state.explodeFactor || 0) < 0.01 && !this.dissectionVM.state.isCutawayOpen) {
        this.dissectionVM.setCutawayOpen(true);
      }
      this.dissectionVM.setActiveWallLayer(layerId);
    };

    this.drawerContentEl.querySelectorAll('.wall-layer-card').forEach(card => {
      card.addEventListener('click', () => selectLayerHandler(card.dataset.layerId));
    });
    this.drawerContentEl.querySelectorAll('.mobile-layer-pill[data-layer-id]').forEach(pill => {
      pill.addEventListener('click', () => selectLayerHandler(pill.dataset.layerId));
    });

    const selectRegionHandler = (regionKey) => {
      this._setActiveHeatmapRegionCard(regionKey);
      if (window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView) {
        window.__DIGESTIVE_APP__.sceneView.pinHeatmapRegion(organ.id, regionKey);
      }
    };

    this.drawerContentEl.querySelectorAll('.heatmap-region-card').forEach(card => {
      card.addEventListener('click', () => selectRegionHandler(card.dataset.regionKey));
    });
    this.drawerContentEl.querySelectorAll('.mobile-layer-pill[data-region-key]').forEach(pill => {
      pill.addEventListener('click', () => selectRegionHandler(pill.dataset.regionKey));
    });

    this.drawerEl.classList.add('open');
    this._setPortraitPopupOpen(true);
  }

  _hideOrganDrawer() {
    this.drawerEl.classList.remove('open');
    this._setPortraitPopupOpen(false);
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
      canvasContainer.dispatchEvent(new CustomEvent('canvas:clear-pin'));
    }
  }

  _handleSearch(query) {
    if (!query) {
      this.searchResultsBox.classList.add('hidden');
      this.searchResultsBox.innerHTML = '';
      return;
    }

    const matches = this.appVM.organsData.filter(o =>
      o.vietnameseName.toLowerCase().includes(query) ||
      o.latinName.toLowerCase().includes(query) ||
      o.englishName.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
      this.searchResultsBox.innerHTML = '<div class="no-result">Không tìm thấy cơ quan phù hợp</div>';
      this.searchResultsBox.classList.remove('hidden');
      return;
    }

    this.searchResultsBox.innerHTML = matches.map(m => `
      <div class="search-item" data-id="${m.id}">
        <strong>${m.vietnameseName}</strong>
        <small>${m.latinName}</small>
      </div>
    `).join('');

    this.searchResultsBox.classList.remove('hidden');

    this.searchResultsBox.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        this._setDockTabUI('organ');
        this.dissectionVM.setState({ isIsolateMode: true });
        this.sceneVM.selectOrgan(id);
        this.searchInput.value = '';
        if (this.searchClearBtn) this.searchClearBtn.classList.add('hidden');
        this.searchResultsBox.classList.add('hidden');
      });
    });
  }

  _renderLandmarksList() {
    const listContainer = document.getElementById('landmarks-list');
    if (!listContainer) return;

    listContainer.innerHTML = this.appVM.landmarksData.map(lm => `
      <div class="landmark-card" data-id="${lm.id}">
        <div class="landmark-badge">${lm.category}</div>
        <h5 style="margin: 4px 0 6px 0; font-size: 13px; font-weight: 700; color: var(--text-main);">${lm.name}</h5>
        <p style="font-size: 11.5px; line-height: 1.45; color: var(--text-muted); margin-bottom: 6px;">${lm.description}</p>
        ${lm.clinicalSignificance ? `
          <div style="margin-top: 6px; padding: 7px 9px; background: rgba(225, 29, 72, 0.07); border-left: 3px solid #e11d48; border-radius: 4px; font-size: 11px; line-height: 1.45; color: var(--text-main);">
            <strong style="color: #e11d48; display: flex; align-items: center; gap: 4px; margin-bottom: 3px;">
              Ý Nghĩa Khám & Dấu Hiệu:
            </strong>
            ${lm.clinicalSignificance}
          </div>
        ` : ''}
      </div>
    `).join('');

    listContainer.querySelectorAll('.landmark-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        this.landmarksVM.selectLandmark(id);
        if (document.body.classList.contains('layout-portrait')) {
          this._setPortraitView('canvas');
          const lm = this.appVM.landmarksData.find(item => item.id === id);
          if (lm) this._showPortraitLandmarkPopup(lm);
        }
      });
    });
  }
}
