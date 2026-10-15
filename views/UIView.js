/**
 * UIView.js
 * DOM UI Controller for Human Digestive Anatomy 3D.
 * Implements MVVM reactive binding with ViewModels:
 * - Search bar with instant autocomplete
 * - Layer peeling dock & Localized Sub-assembly Explosion slider
 * - Medical Info Drawer populated with ĐHYHN clinical curriculum
 * - Quick surgical preset buttons
 */
export class UIView {
  constructor(appVM) {
    this.appVM = appVM;
    this.sceneVM = appVM.sceneVM;
    this.dissectionVM = appVM.dissectionVM;
    this.landmarksVM = appVM.landmarksVM;

    this.drawerEl = document.getElementById('organ-drawer');
    this.drawerTitleEl = document.getElementById('drawer-title');
    this.drawerLatinEl = document.getElementById('drawer-latin');
    this.drawerContentEl = document.getElementById('drawer-content');
    this.drawerCloseBtn = document.getElementById('drawer-close');

    this.depthSlider = document.getElementById('depth-slider');
    this.depthValueLabel = document.getElementById('depth-value');

    this.localExplodeContainer = document.getElementById('local-explode-box');
    this.localExplodeSlider = document.getElementById('local-explode-slider');
    this.localExplodeLabel = document.getElementById('local-explode-value');
    this.localExplodeTitle = document.getElementById('local-explode-organ-name');

    this.isolateBtn = document.getElementById('btn-isolate');
    this.xrayBtn = document.getElementById('btn-xray');
    this.resetCameraBtn = document.getElementById('btn-reset-camera');
    this.themeToggleBtn = document.getElementById('btn-theme-toggle');

    this.searchInput = document.getElementById('organ-search');
    this.searchResultsBox = document.getElementById('search-results');

    this.modePills = document.querySelectorAll('.mode-pill');
    this.landmarksPanel = document.getElementById('landmarks-panel');

    // Stomach wall controls
    this.stomachWallBox = document.getElementById('stomach-wall-box');
    this.stomachWallExplodeSlider = document.getElementById('stomach-wall-explode-slider');
    this.stomachWallExplodeValue = document.getElementById('stomach-wall-explode-value');
    this.stomachFocusBtn = document.getElementById('btn-stomach-focus');
    this.stomachCutawayBtn = document.getElementById('btn-stomach-cutaway');
    this.stomachPresetPills = document.querySelectorAll('.wall-preset-pill');
    this.stomachLayerItems = document.querySelectorAll('.wall-layer-item');

    // Torso skin opacity controls
    this.torsoOpacitySlider = document.getElementById('torso-opacity-slider');
    this.torsoOpacityValue = document.getElementById('torso-opacity-value');

    this._bindDOMEvents();
    this._bindViewModelEvents();
    this._renderLandmarksList();
  }

  _bindDOMEvents() {
    // 1. Thanh trượt Bóc Tách Tầng Sâu (Depth Peeling Slider)
    this.depthSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.dissectionVM.setDepthLevel(val);
      const labels = {
        1: 'Tầng 1 (Toàn thể)',
        2: 'Tầng 2 (Bóc Mạc Nối)',
        3: 'Tầng 3 (Bộc Lộ Tá-Tụy)',
        4: 'Tầng 4 (Cuống Mạch)',
        5: 'Tầng 5 (Sâu nhất)'
      };
      this.depthValueLabel.textContent = labels[val] || `Tầng ${val}`;
    });

    // 2. Thanh trượt Phân Rã Cục Bộ (Localized Explosion Slider)
    this.localExplodeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.dissectionVM.setLocalExplodeFactor(val);
      this.localExplodeLabel.textContent = `${Math.round(val * 100)}%`;
    });

    // 3. Nút Cô Lập Tạng (Isolate Mode)
    this.isolateBtn.addEventListener('click', () => {
      this.dissectionVM.toggleIsolateMode();
    });

    // 4. Nút X-Ray Thấu Quang
    this.xrayBtn.addEventListener('click', () => {
      this.dissectionVM.toggleXRayMode();
    });

    // 5. Nút Căn Lại Camera
    this.resetCameraBtn.addEventListener('click', () => {
      this.sceneVM.resetCamera();
    });

    // 6. Đổi Theme Sáng / Tối
    this.themeToggleBtn.addEventListener('click', () => {
      this.appVM.toggleTheme();
    });

    // 7. Đóng Drawer thông tin
    this.drawerCloseBtn.addEventListener('click', () => {
      this.sceneVM.selectOrgan(null);
    });

    // 8. Tìm kiếm tức thì đa ngữ
    this.searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      this._handleSearch(q);
    });

    // 9. Chuyển chế độ xem (Tabs)
    this.modePills.forEach(pill => {
      pill.addEventListener('click', () => {
        const mode = pill.dataset.mode;
        this.appVM.setMode(mode);
      });
    });

    // 10. Thanh trượt Bóc Tách 4 Lớp Thành Dạ Dày
    if (this.stomachWallExplodeSlider) {
      this.stomachWallExplodeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.dissectionVM.setStomachWallExplodeFactor(val);
        if (this.stomachWallExplodeValue) {
          this.stomachWallExplodeValue.textContent = `${Math.round(val * 100)}%`;
        }
      });
    }

    // 11. Nút Phóng to Dạ Dày
    if (this.stomachFocusBtn) {
      this.stomachFocusBtn.addEventListener('click', () => {
        if (window.__DIGESTIVE_APP__ && window.__DIGESTIVE_APP__.sceneView) {
          window.__DIGESTIVE_APP__.sceneView.focusStomach();
        }
      });
    }

    // 11b. Nút Cắt Mở Lòng Dạ Dày (Cutaway Window)
    if (this.stomachCutawayBtn) {
      this.stomachCutawayBtn.addEventListener('click', () => {
        this.dissectionVM.toggleCutaway();
      });
    }

    // 11c. Thanh trượt Độ Mờ Da Torso (Torso Skin Opacity)
    if (this.torsoOpacitySlider) {
      this.torsoOpacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.dissectionVM.setTorsoSkinOpacity(val);
        if (this.torsoOpacityValue) {
          this.torsoOpacityValue.textContent = `${Math.round(val * 100)}%`;
        }
      });
    }

    // 12. Nút Preset Bóc Lớp Nhanh
    this.stomachPresetPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const preset = pill.dataset.preset;
        this.dissectionVM.peelToLayer(preset);
        this.stomachPresetPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    // 13. Toggles 4 Lớp Thành Dạ Dày
    this.stomachLayerItems.forEach(item => {
      const layerId = item.dataset.layerId;
      const chk = item.querySelector('input[type="checkbox"]');
      if (chk) {
        chk.addEventListener('change', () => {
          this.dissectionVM.setStomachWallLayerVisibility(layerId, chk.checked);
        });
      }
      item.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          this.dissectionVM.setActiveWallLayer(layerId);
          const targetCard = document.getElementById(`card-${layerId}`);
          if (targetCard) {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.querySelectorAll('.wall-layer-card').forEach(c => c.classList.remove('highlight'));
            targetCard.classList.add('highlight');
          }
        }
      });
    });
  }

  _bindViewModelEvents() {
    // 1. Cập nhật Info Drawer khi chọn tạng
    this.sceneVM.subscribe('selectedOrganId', (organId) => {
      if (organId) {
        const organ = this.appVM.organsData.find(o => o.id === organId);
        if (organ) {
          this._showOrganDrawer(organ);
        }
      } else {
        this._hideOrganDrawer();
      }
    });

    // 2. Hiện / Ẩn thanh phân rã cục bộ
    this.dissectionVM.subscribe('localExplodeOrganId', (organId) => {
      if (organId) {
        const organ = this.appVM.organsData.find(o => o.id === organId);
        if (organ && organ.canLocalExplode) {
          this.localExplodeContainer.classList.remove('hidden');
          this.localExplodeTitle.textContent = organ.vietnameseName;
          this.localExplodeSlider.value = 0;
          this.localExplodeLabel.textContent = '0%';
        } else {
          this.localExplodeContainer.classList.add('hidden');
        }
      } else {
        this.localExplodeContainer.classList.add('hidden');
      }
    });

    // 3. Nút Isolate active state
    this.dissectionVM.subscribe('isIsolateMode', (isIsolate) => {
      if (isIsolate) {
        this.isolateBtn.classList.add('active');
      } else {
        this.isolateBtn.classList.remove('active');
      }
    });

    // 4. Nút X-Ray active state
    this.dissectionVM.subscribe('isXRayMode', (isXRay) => {
      if (isXRay) {
        this.xrayBtn.classList.add('active');
      } else {
        this.xrayBtn.classList.remove('active');
      }
    });

    // 5. Cập nhật thanh trượt Bóc Tách Tầng Sâu (Depth Peeling)
    this.dissectionVM.subscribe('depthLevel', (level) => {
      this.depthSlider.value = level;
      const labels = {
        1: 'Tầng 1 (Toàn thể)',
        2: 'Tầng 2 (Bóc Mạc Nối)',
        3: 'Tầng 3 (Bộc Lộ Tá-Tụy)',
        4: 'Tầng 4 (Cuống Mạch)',
        5: 'Tầng 5 (Sâu nhất)'
      };
      this.depthValueLabel.textContent = labels[level] || `Tầng ${level}`;
    });

    // 6. Cập nhật thanh trượt Phân Rã Cục Bộ (Localized Explosion)
    this.dissectionVM.subscribe('localExplodeFactor', (factor) => {
      this.localExplodeSlider.value = factor;
      this.localExplodeLabel.textContent = `${Math.round(factor * 100)}%`;
    });

    // 5. Thay đổi Theme class trên body
    this.appVM.subscribe('theme', (theme) => {
      if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        this.themeToggleBtn.innerHTML = '☀️ Light Mode';
      } else {
        document.body.classList.remove('dark-theme');
        this.themeToggleBtn.innerHTML = '🌙 Dark Mode';
      }
    });

    // 6. Chuyển chế độ hiển thị Mode
    this.appVM.subscribe('activeMode', (mode) => {
      this.modePills.forEach(p => {
        p.classList.toggle('active', p.dataset.mode === mode);
      });
      if (mode === 'pathology') {
        this.landmarksPanel.classList.remove('hidden');
      } else {
        this.landmarksPanel.classList.add('hidden');
      }
    });

    // 7. Hiện / Ẩn Stomach Wall Dissection Dock khi chọn Dạ Dày
    this.sceneVM.subscribe('selectedOrganId', (organId) => {
      if (this.stomachWallBox) {
        if (organId === 'stomach') {
          this.stomachWallBox.classList.remove('hidden');
        } else {
          this.stomachWallBox.classList.add('hidden');
        }
      }
    });

    // 8. Đồng bộ Checkbox & Active state của 4 Lớp
    this.dissectionVM.subscribe('stomachWallLayers', (layers) => {
      if (!layers) return;
      this.stomachLayerItems.forEach(item => {
        const layerId = item.dataset.layerId;
        const chk = item.querySelector('input[type="checkbox"]');
        if (chk && layers[layerId] !== undefined) {
          chk.checked = layers[layerId];
        }
      });
    });

    // 9. Đồng bộ thanh trượt Wall Explode
    this.dissectionVM.subscribe('stomachWallExplodeFactor', (factor) => {
      if (this.stomachWallExplodeSlider) {
        this.stomachWallExplodeSlider.value = factor;
      }
      if (this.stomachWallExplodeValue) {
        this.stomachWallExplodeValue.textContent = `${Math.round(factor * 100)}%`;
      }
    });

    // 10. Đồng bộ Active Layer Highlight
    this.dissectionVM.subscribe('activeWallLayerId', (layerId) => {
      this.stomachLayerItems.forEach(item => {
        item.classList.toggle('active-layer', item.dataset.layerId === layerId);
      });
      document.querySelectorAll('.wall-layer-card').forEach(card => {
        card.classList.toggle('highlight', card.id === `card-${layerId}`);
      });
    });

    // 11. Đồng bộ trạng thái Cutaway Window
    this.dissectionVM.subscribe('isCutawayOpen', (isOpen) => {
      if (this.stomachCutawayBtn) {
        this.stomachCutawayBtn.classList.toggle('active', isOpen);
        this.stomachCutawayBtn.textContent = isOpen ? '✖ Đóng Lòng' : '✂️ Cắt Mở Lòng';
      }
    });

    // 12. Đồng bộ thanh trượt Torso Skin Opacity
    this.dissectionVM.subscribe('torsoSkinOpacity', (val) => {
      if (this.torsoOpacitySlider) this.torsoOpacitySlider.value = val;
      if (this.torsoOpacityValue) this.torsoOpacityValue.textContent = `${Math.round(val * 100)}%`;
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
      wallLayersHtml = `
        <div class="drawer-section">
          <h4 style="color: #e11d48; display: flex; align-items: center; gap: 6px;">
            🔬 Cấu Tạo Mô Học Thành Dạ Dày (${organ.wallLayers.length} Lớp):
          </h4>
          <p style="font-size: 11px; margin-bottom: 8px; color: var(--text-muted);">
            Bấm vào từng tầng để xem mô tả cấu trúc vi thể và ý nghĩa phẫu thuật tương ứng:
          </p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${organ.wallLayers.map(l => `
              <div class="wall-layer-card" id="card-${l.id}" data-layer-id="${l.id}">
                <div class="wall-layer-card-header">
                  <span class="wall-layer-card-title">
                    <span class="layer-dot" style="background: ${l.color};"></span>
                    ${l.name}
                  </span>
                  <span class="wall-layer-thickness-badge">${l.thickness}</span>
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
            `).join('')}
          </div>
        </div>
      `;
    }

    this.drawerContentEl.innerHTML = `
      <div class="drawer-badge">Tầng Bóc Tách: ${organ.layer}</div>
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

    // Gán sự kiện click vào các thẻ lớp mô học trong Drawer
    this.drawerContentEl.querySelectorAll('.wall-layer-card').forEach(card => {
      card.addEventListener('click', () => {
        const layerId = card.dataset.layerId;
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
        <h5>${lm.name}</h5>
        <p>${lm.description}</p>
      </div>
    `).join('');

    listContainer.querySelectorAll('.landmark-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        this.landmarksVM.selectLandmark(id);
        listContainer.querySelectorAll('.landmark-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });
  }
}
