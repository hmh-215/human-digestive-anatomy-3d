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
