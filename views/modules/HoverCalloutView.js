/**
 * HoverCalloutView.js
 * Module 4: Renders a floating 2D Callout Badge with an SVG Leader Line and Anchor Dot
 * whenever the user hovers over any 3D organ or exploded histological layer.
 * 
 * Mathematically pins the leader line directly to the callout card's edge with zero detachment.
 */
export class HoverCalloutView {
  constructor(container) {
    this.container = container;
    this._buildDOM();
  }

  _buildDOM() {
    // Full-viewport non-interactive SVG overlay for the leader line + anchor dot
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'hover-callout-overlay';
    this.overlayEl.className = 'hover-callout-overlay hidden';
    this.overlayEl.innerHTML = `
      <svg class="hover-leader-svg" width="100%" height="100%">
        <polyline id="hover-leader-line" class="hover-leader-line" points="0,0 0,0 0,0" />
        <circle id="hover-anchor-pulse" class="hover-anchor-pulse" cx="0" cy="0" r="10" />
        <circle id="hover-anchor-dot" class="hover-anchor-dot" cx="0" cy="0" r="6" stroke="#ffffff" stroke-width="2" />
        <circle id="hover-card-pin" class="hover-card-pin" cx="0" cy="0" r="3.5" />
      </svg>
      <div id="hover-callout-card" class="hover-callout-card callout">
        <div class="hover-callout-top">
          <span id="hover-callout-dot" class="hover-callout-dot"></span>
          <span id="hover-callout-tag" class="hover-callout-tag">MÔ HỌC DẠ DÀY</span>
          <span id="hover-callout-badge" class="hover-callout-badge"></span>
        </div>
        <div id="hover-callout-title" class="hover-callout-title">Tên Lớp / Cơ Quan</div>
        <div id="hover-callout-desc" class="hover-callout-desc"></div>
        <div class="hover-callout-hint">Bấm để mở hồ sơ giải phẫu chi tiết</div>
      </div>
    `;
    this.container.appendChild(this.overlayEl);

    this.lineEl = this.overlayEl.querySelector('#hover-leader-line');
    this.dotEl = this.overlayEl.querySelector('#hover-anchor-dot');
    this.pulseEl = this.overlayEl.querySelector('#hover-anchor-pulse');
    this.pinEl = this.overlayEl.querySelector('#hover-card-pin');
    this.cardEl = this.overlayEl.querySelector('#hover-callout-card');
    this.colorDotEl = this.overlayEl.querySelector('#hover-callout-dot');
    this.tagEl = this.overlayEl.querySelector('#hover-callout-tag');
    this.badgeEl = this.overlayEl.querySelector('#hover-callout-badge');
    this.titleEl = this.overlayEl.querySelector('#hover-callout-title');
    this.descEl = this.overlayEl.querySelector('#hover-callout-desc');
  }

  /**
   * Shows and positions the floating callout badge + leader line at (x, y) in container coordinates.
   * Ensures 100% continuous connection between the leader line and the callout card border.
   * @param {Object|null} hoverData
   */
  update(hoverData) {
    if (!hoverData) {
      this.overlayEl.classList.add('hidden');
      return;
    }

    const { x, y, title, subtitle, tag, badge, color } = hoverData;
    const vw = this.container.clientWidth || window.innerWidth;
    const vh = this.container.clientHeight || window.innerHeight;

    const accentColor = color || '#c8102e';
    this.colorDotEl.style.background = accentColor;
    this.dotEl.setAttribute('fill', accentColor);
    this.pulseEl.setAttribute('stroke', accentColor);
    this.lineEl.setAttribute('stroke', accentColor);
    if (this.pinEl) this.pinEl.setAttribute('fill', accentColor);

    this.tagEl.textContent = tag || 'GIẢI PHẪU 3D';
    if (badge) {
      this.badgeEl.textContent = badge;
      this.badgeEl.style.display = 'inline-block';
    } else {
      this.badgeEl.style.display = 'none';
    }

    this.titleEl.textContent = title || '';
    if (subtitle) {
      this.descEl.textContent = subtitle;
      this.descEl.style.display = 'block';
    } else {
      this.descEl.style.display = 'none';
    }

    this.cardEl.style.borderColor = accentColor;

    const isCompact = vw <= 960 || vh <= 540;
    const drawerEl = document.getElementById('organ-drawer');
    const isDrawerOpen = !!(drawerEl && drawerEl.classList.contains('open') && drawerEl.offsetWidth > 0);
    this.cardEl.classList.toggle('is-drawer-compact', isCompact && isDrawerOpen);

    // Show overlay first so cardEl has layout dimensions
    this.overlayEl.classList.remove('hidden');

    const cardWidth = Math.min(isCompact ? 175 : 310, Math.max(isCompact ? 135 : 240, this.cardEl.offsetWidth || (isCompact ? 160 : 285)));
    const cardHeight = Math.max(36, this.cardEl.offsetHeight || (isCompact && isDrawerOpen ? 44 : 105));

    // Measure actual open panels so the callout adapts dynamically on both desktop & mobile
    const containerRect = this.container.getBoundingClientRect();
    let minSafeLeft = 12;
    const leftPanelEl = ['dissection-dock', 'landmarks-panel']
      .map(id => document.getElementById(id))
      .find(el => el && !el.classList.contains('hidden') && el.offsetWidth > 0);
    if (leftPanelEl) {
      const r = leftPanelEl.getBoundingClientRect();
      if (r.width < vw * 0.5 && r.bottom > containerRect.top + 80) {
        minSafeLeft = Math.max(12, Math.round(r.right - containerRect.left + 10));
      }
    }

    let maxSafeRight = vw - 12;
    if (isDrawerOpen) {
      const r = drawerEl.getBoundingClientRect();
      if (r.width < vw * 0.5 && r.left > containerRect.left + vw * 0.4) {
        maxSafeRight = Math.min(vw - 12, Math.round(r.left - containerRect.left - 10));
      }
    }

    let cardLeft;
    let cardTop;
    let attachX;
    let attachY;
    let elbowX;
    let elbowY;

    if (isCompact && isDrawerOpen) {
      // On compact screens with an open drawer, dock badge cleanly above/below the organ so 3D anatomy & pin stay clear
      const centerLane = (minSafeLeft + maxSafeRight) * 0.5;
      cardLeft = Math.max(minSafeLeft, Math.min(maxSafeRight - cardWidth, Math.round(centerLane - cardWidth * 0.5)));
      const placeAbove = y > vh * 0.45;
      cardTop = placeAbove ? 10 : Math.max(10, vh - cardHeight - 10);
      attachX = Math.max(cardLeft + 12, Math.min(cardLeft + cardWidth - 12, x));
      attachY = placeAbove ? (cardTop + cardHeight) : cardTop;
      elbowX = x;
      elbowY = Math.round((y + attachY) * 0.5);
    } else {
      const offsetGap = isCompact ? 18 : 54;
      const availableLeft = x - minSafeLeft;
      const availableRight = maxSafeRight - x;

      // Decide placement side: prefer side with ample room
      let placeLeft = (availableLeft >= availableRight);
      if (availableLeft < cardWidth + offsetGap && availableRight >= cardWidth + offsetGap) {
        placeLeft = false;
      } else if (availableRight < cardWidth + offsetGap && availableLeft >= cardWidth + offsetGap) {
        placeLeft = true;
      }

      if (placeLeft) {
        cardLeft = Math.max(8, Math.max(minSafeLeft, x - cardWidth - offsetGap));
        cardLeft = Math.min(vw - cardWidth - 8, cardLeft);
        attachX = cardLeft + cardWidth; // Line touches the right border of the card
      } else {
        cardLeft = Math.min(vw - cardWidth - 8, Math.min(maxSafeRight - cardWidth, x + offsetGap));
        cardLeft = Math.max(8, cardLeft);
        attachX = cardLeft; // Line touches the left border of the card
      }

      // Vertical placement clamped safely inside canvas container
      cardTop = y - (isCompact ? 18 : 26);
      cardTop = Math.max(8, Math.min(Math.max(8, vh - cardHeight - 10), cardTop));
      attachY = Math.min(vh - 14, cardTop + 22); // Points directly to the header line of the card

      if (placeLeft) {
        elbowX = attachX + Math.min(32, Math.max(16, (x - attachX) * 0.45));
      } else {
        elbowX = attachX - Math.min(32, Math.max(16, (attachX - x) * 0.45));
      }
      elbowY = attachY;
    }

    // Compute Leader Line Points
    // 1. Anchor Dot on Organ: (x, y)
    this.dotEl.setAttribute('cx', x);
    this.dotEl.setAttribute('cy', y);
    this.pulseEl.setAttribute('cx', x);
    this.pulseEl.setAttribute('cy', y);

    // 2. Connect line flush to card border
    this.lineEl.setAttribute('points', `${x},${y} ${elbowX},${elbowY} ${attachX},${attachY}`);

    if (this.pinEl) {
      this.pinEl.setAttribute('cx', attachX);
      this.pinEl.setAttribute('cy', attachY);
    }

    // Apply card position
    this.cardEl.style.left = `${cardLeft}px`;
    this.cardEl.style.top = `${cardTop}px`;
  }
}
