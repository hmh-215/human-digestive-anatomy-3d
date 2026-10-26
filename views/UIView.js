/**
 * UIView.js
 * 2-Tab Context-Aware DOM UI Controller for Human Digestive Anatomy 3D.
 *
 * Features:
 * - Tab 1 (🌐 Toàn Hệ Thống): Whole-System 4-Row Knolling Catalog Grid
 * - Tab 2 (🔬 Cô Lập Bộ Phận): Isolated Organ Concentric Layer Telescoping (with auto-isolation)
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
    this.xrayBtn = document.getElementById('btn-xray');
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

    this._bindDOMEvents();
    this._bindViewModelEvents();
    this._renderLandmarksList();
  }

  _setDockTabUI(tabName) {
    const isOrganTab = (tabName === 'organ');
    if (this.tabBtnSystem) this.tabBtnSystem.classList.toggle('active', !isOrganTab);
    if (this.tabBtnOrgan) this.tabBtnOrgan.classList.toggle('active', isOrganTab);
    if (this.tabPaneSystem) this.tabPaneSystem.classList.toggle('hidden', isOrganTab);
    if (this.tabPaneOrgan) this.tabPaneOrgan.classList.toggle('hidden', !isOrganTab);
  }

  _bindDOMEvents() {
    // 0. Task 1: 2-Tab Switcher (Tab 1: Whole System Knolling vs. Tab 2: Isolated Organ)
    if (this.tabBtnSystem) {
      this.tabBtnSystem.addEventListener('click', () => {
        this._setDockTabUI('system');
        this.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0 });
        this.sceneVM.resetCamera();
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
      });
    }

    // 4. Quick Organ Chips (Tab 2)
    this.organChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const organId = chip.dataset.organ || null;
        if (!organId) {
          this._setDockTabUI('system');
          this.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0 });
          this.sceneVM.resetCamera();
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

    // 7. X-Ray Mode Toggle
    if (this.xrayBtn) {
      this.xrayBtn.addEventListener('click', () => {
        this.dissectionVM.toggleXRayMode();
      });
    }

    // 8. Reset Camera
    if (this.resetCameraBtn) {
      this.resetCameraBtn.addEventListener('click', () => {
        this._setDockTabUI('system');
        this.dissectionVM.setState({ isIsolateMode: false, explodeFactor: 0 });
        this.sceneVM.resetCamera();
      });
    }

    // 9. Theme Toggle
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => {
        this.appVM.toggleTheme();
      });
    }

    // 10. Close Drawer
    if (this.drawerCloseBtn) {
      this.drawerCloseBtn.addEventListener('click', () => {
        this.drawerEl.classList.remove('open');
      });
    }

    // 11. Search Bar
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        this._handleSearch(q);
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
            this.explodeModeLabel.textContent = '💥 Tách 6 Lớp Dạ Dày (Trong → Ngoài):';
            this.explodeHelperText.textContent = 'Các lớp trong tiến về phía người xem, nằm gọn trong lòng lớp ngoài tương ứng';
          } else if (organId === 'esophagus') {
            this.explodeModeLabel.textContent = '💥 Tách 5 Lớp Thực Quản (Trong → Ngoài):';
            this.explodeHelperText.textContent = 'Vỏ xơ Adventitia → Cơ dọc → Cơ vòng → Dưới niêm mạc → Biểu mô lát tầng';
          } else if (organId === 'duodenum') {
            this.explodeModeLabel.textContent = '💥 Tách 5 Lớp Tá Tràng (Trong → Ngoài):';
            this.explodeHelperText.textContent = 'Thanh mạc → Cơ dọc → Cơ vòng → Tuyến Brunner dưới niêm → Nếp vòng Kerckring';
          } else if (organId === 'small_intestine') {
            this.explodeModeLabel.textContent = '💥 Tách 5 Lớp Ruột Non (Trong → Ngoài):';
            this.explodeHelperText.textContent = 'Thanh mạc → Cơ dọc Auerbach → Cơ vòng → Dưới niêm mạc → Nhung mao Villi';
          } else if (organId === 'large_intestine') {
            this.explodeModeLabel.textContent = '💥 Tách 5 Lớp Đại Tràng (Trong → Ngoài):';
            this.explodeHelperText.textContent = 'Từ trong ra ngoài: Mucosa (Niêm mạc) > Submucosa (Dưới niêm) > Stratum (Cơ vòng & Cơ dọc) > Serosa (Thanh mạc)';
          } else if (organId === 'gallbladder_tree') {
            this.explodeModeLabel.textContent = '💥 Tách 4 Lớp Túi Mật & Đường Mật:';
            this.explodeHelperText.textContent = 'Thanh mạc & mô xơ quanh cơ → Lớp cơ trơn → Lớp đệm Lamina propria → Niêm mạc tổ ong';
          } else if (organId === 'liver') {
            this.explodeModeLabel.textContent = '💥 Phân Tách 8 Hạ Phân Thùy Gan (Couinaud):';
            this.explodeHelperText.textContent = 'Tách rời 8 hạ phân thùy gan (I → VIII) chuẩn phẫu thuật gan mật (không trùng lặp)';
          } else {
            this.explodeModeLabel.textContent = `💥 Tách Cấu Trúc ${organ.vietnameseName}:`;
            this.explodeHelperText.textContent = 'Tách rời các cấu trúc con để rê chuột xem nhãn giải phẫu chi tiết';
          }

          this._showOrganDrawer(organ);
        }
      } else {
        this._setDockTabUI('system');
        if (this.contextSubEl) this.contextSubEl.textContent = 'CHẾ ĐỘ TOÀN HỆ THỐNG';
        this.contextTitleEl.textContent = 'Toàn Hệ Tiêu Hóa';
        this.backSystemBtn.classList.add('hidden');
        this.explodeModeLabel.textContent = '💥 Xếp Hàng Toàn Hệ Thống (4 Hàng):';
        this.explodeHelperText.textContent = 'Kéo thanh trượt hoặc bấm nút để xếp toàn bộ cơ quan & lớp mô học theo 4 hàng ngang';
        this._hideOrganDrawer();
      }
    });

    // 2. Sync Unified Explode Slider & Trigger Button Label
    this.dissectionVM.subscribe('explodeFactor', (factor) => {
      const pct = Math.round((factor || 0) * 100);
      if (this.explodeSlider) this.explodeSlider.value = factor || 0;
      if (this.explodeValueBadge) this.explodeValueBadge.textContent = `${pct}%`;
      if (this.animateExplodeBtn) {
        const isExpanded = factor > 0.3;
        this.animateExplodeBtn.classList.toggle('active', isExpanded);
        this.animateExplodeBtn.textContent = isExpanded ? '🔄 Thu Gọn' : '💥 Tách Lớp';
      }
    });

    // 3. Sync Isolate, X-Ray, and Cutaway button states
    this.dissectionVM.subscribe('isIsolateMode', (isIsolate) => {
      if (this.isolateBtn) this.isolateBtn.classList.toggle('active', isIsolate);
    });

    this.dissectionVM.subscribe('isXRayMode', (isXRay) => {
      if (this.xrayBtn) this.xrayBtn.classList.toggle('active', isXRay);
    });

    this.dissectionVM.subscribe('isCutawayOpen', (isOpen) => {
      if (this.cutawayBtn) {
        this.cutawayBtn.classList.toggle('active', isOpen);
        this.cutawayBtn.textContent = isOpen ? '✖ Đóng Mặt Cắt' : '✂️ Mặt Cắt Dọc 50%';
      }
    });

    // 4. Sync Active Wall Layer Card in Right Drawer when clicked
    this.dissectionVM.subscribe('activeWallLayerId', (layerId) => {
      if (!layerId) return;
      const targetCard = document.getElementById(`card-${layerId}`);
      document.querySelectorAll('.wall-layer-card').forEach(card => {
        card.classList.toggle('highlight', card.id === `card-${layerId}`);
      });
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    // 5. Sync Torso Opacity Slider
    this.dissectionVM.subscribe('torsoSkinOpacity', (val) => {
      if (this.torsoOpacitySlider) this.torsoOpacitySlider.value = val;
      if (this.torsoOpacityValue) this.torsoOpacityValue.textContent = `${Math.round(val * 100)}%`;
    });

    // 6. Theme Toggle
    this.appVM.subscribe('theme', (theme) => {
      if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        this.themeToggleBtn.innerHTML = '☀️ Light Mode';
      } else {
        document.body.classList.remove('dark-theme');
        this.themeToggleBtn.innerHTML = '🌙 Dark Mode';
      }
    });

    // 7. Mode Switcher (Ensure Landmarks Panel and Dissection Dock NEVER overlap)
    this.appVM.subscribe('activeMode', (mode) => {
      this.modePills.forEach(p => {
        p.classList.toggle('active', p.dataset.mode === mode);
      });
      if (mode === 'pathology') {
        this.landmarksPanel.classList.remove('hidden');
        if (this.dissectionDockEl) this.dissectionDockEl.classList.add('hidden');
        this._hideOrganDrawer();
      } else {
        this.landmarksPanel.classList.add('hidden');
        if (this.dissectionDockEl) this.dissectionDockEl.classList.remove('hidden');
      }
    });

    // 8. Sync Active Landmark in Left List when selected (from list or direct 3D pin click)
    this.landmarksVM.subscribe('activeLandmarkId', (activeId) => {
      const listContainer = document.getElementById('landmarks-list');
      if (!listContainer) return;
      listContainer.querySelectorAll('.landmark-card').forEach(card => {
        const isMatch = (card.dataset.id === activeId);
        card.classList.toggle('active', isMatch);
        if (isMatch) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }

  _showOrganDrawer(organ) {
    this.drawerTitleEl.textContent = organ.vietnameseName;
    this.drawerLatinEl.textContent = `${organ.latinName} • ${organ.englishName}`;

    let subListHtml = '';
    if (organ.subComponents && organ.subComponents.length > 0) {
      subListHtml = `
        <div class="drawer-section">
          <h4>🧩 Cấu Trúc Con Phân Rã (${organ.subComponents.length} thành phần):</h4>
          <div class="sub-tags">
            ${organ.subComponents.map(s => `<span class="tag-chip">${s.name}</span>`).join('')}
          </div>
        </div>
      `;
    }

    let wallLayersHtml = '';
    if (organ.wallLayers && organ.wallLayers.length > 0) {
      // Display wall layers ordered from INSIDE to OUTSIDE (Mucosa > Submucosa > Stratum > Serosa)
      const orderedLayers = [...organ.wallLayers].reverse();
      wallLayersHtml = `
        <div class="drawer-section">
          <h4 style="color: #e11d48; display: flex; align-items: center; gap: 6px;">
            🔬 Cấu Tạo Mô Học Thành ${organ.vietnameseName} (Trong → Ngoài: ${organ.wallLayers.length} Lớp):
          </h4>
          <p style="font-size: 11px; margin-bottom: 8px; color: var(--text-muted);">
            Thứ tự từ <strong>Trong ra Ngoài</strong> (Mucosa &gt; Submucosa &gt; Stratum &gt; Serosa). Bấm vào từng tầng để làm sáng lớp 3D:
          </p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${orderedLayers.map((l, idx) => {
              const posBadge = idx === 0
                ? 'Trong cùng (Lòng ống)'
                : (idx === orderedLayers.length - 1 ? 'Ngoài cùng (Bề mặt)' : `Tầng giữa (${idx + 1}/${orderedLayers.length})`);
              return `
              <div class="wall-layer-card" id="card-${l.id}" data-layer-id="${l.id}">
                <div class="wall-layer-card-header">
                  <span class="wall-layer-card-title">
                    <span class="layer-dot" style="background: ${l.color};"></span>
                    ${l.name}
                  </span>
                  <span class="wall-layer-thickness-badge">${posBadge} • ${l.thickness}</span>
                </div>
                <div class="wall-sub-block">
                  <strong>📍 Đại thể:</strong> ${l.description}
                </div>
                <div class="wall-sub-block">
                  <strong>🔬 Mô học vi thể:</strong> ${l.histology}
                </div>
                <div class="wall-sub-block">
                  <strong>⚡ Sinh lý:</strong> ${l.physiology}
                </div>
                <div class="wall-clinical-sub">
                  <strong>⚠️ Lâm sàng ĐHYHN:</strong> ${l.clinicalNotes}
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
      <div class="drawer-section">
        <h4>📍 Vị Trí & Liên Quan Giải Phẫu:</h4>
        <p>${organ.location}</p>
      </div>
      <div class="drawer-section">
        <h4>🔬 Hình Thể Ngoài & Cấu Trúc Trong:</h4>
        <p>${organ.structure}</p>
      </div>
      ${wallLayersHtml}
      ${subListHtml}
      <div class="drawer-section">
        <h4>🩸 Mạch Máu & Thần Kinh Chi Phối:</h4>
        <p>${organ.vasculature}</p>
      </div>
      <div class="drawer-section">
        <h4>⚡ Chức Năng Tiêu Hóa Sinh Lý:</h4>
        <p>${organ.physiology}</p>
      </div>
      <div class="drawer-section highlight-box">
        <h4>⚠️ Ý Nghĩa Ngoại Khoa & Lâm Sàng (ĐHYHN):</h4>
        <p>${organ.clinicalNotes}</p>
      </div>
    `;

    this.drawerContentEl.querySelectorAll('.wall-layer-card').forEach(card => {
      card.addEventListener('click', () => {
        const layerId = card.dataset.layerId;
        if ((this.dissectionVM.state.explodeFactor || 0) < 0.01 && !this.dissectionVM.state.isCutawayOpen) {
          this.dissectionVM.setCutawayOpen(true);
        }
        this.dissectionVM.setActiveWallLayer(layerId);
      });
    });

    this.drawerEl.classList.add('open');
  }

  _hideOrganDrawer() {
    this.drawerEl.classList.remove('open');
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
              🩺 Ý Nghĩa Khám & Dấu Hiệu:
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
      });
    });
  }
}
