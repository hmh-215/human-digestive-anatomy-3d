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
        <circle id="hover-anchor-pulse" class="hover-anchor-pulse" cx="0" cy="0" r="8" />
        <circle id="hover-anchor-dot" class="hover-anchor-dot" cx="0" cy="0" r="4.5" />
        <circle id="hover-card-pin" class="hover-card-pin" cx="0" cy="0" r="3.5" />
      </svg>
      <div id="hover-callout-card" class="hover-callout-card">
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

    const accentColor = color || '#0284c7';
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

    // Show overlay first so cardEl has layout dimensions
    this.overlayEl.classList.remove('hidden');

    const cardWidth = Math.min(310, Math.max(260, this.cardEl.offsetWidth || 290));
    const cardHeight = Math.max(100, this.cardEl.offsetHeight || 130);

    // Collision boundaries
    const isDockHidden = document.getElementById('dock-panel')?.classList.contains('hidden');
    const minSafeLeft = isDockHidden ? 20 : 330;
    const isDrawerOpen = document.getElementById('organ-drawer')?.classList.contains('open');
    const maxSafeRight = isDrawerOpen ? vw - 470 : vw - 24;

    const availableLeft = x - minSafeLeft;
    const availableRight = maxSafeRight - x;

    // Decide placement side: prefer side with ample room
    let placeLeft = (availableLeft >= availableRight);
    if (availableLeft < cardWidth + 50 && availableRight >= cardWidth + 50) {
      placeLeft = false;
    } else if (availableRight < cardWidth + 50 && availableLeft >= cardWidth + 50) {
      placeLeft = true;
    }

    let cardLeft;
    let attachX;
    if (placeLeft) {
      cardLeft = Math.max(minSafeLeft, x - cardWidth - 60);
      attachX = cardLeft + cardWidth; // Line touches the right border of the card
    } else {
      cardLeft = Math.min(maxSafeRight - cardWidth, x + 60);
      attachX = cardLeft; // Line touches the left border of the card
    }

    // Vertical placement
    let cardTop = y - 26;
    cardTop = Math.max(76, Math.min(vh - cardHeight - 50, cardTop));
    const attachY = cardTop + 24; // Points directly to the header line of the card

    // Compute Leader Line Points
    // 1. Anchor Dot on Organ: (x, y)
    this.dotEl.setAttribute('cx', x);
    this.dotEl.setAttribute('cy', y);
    this.pulseEl.setAttribute('cx', x);
    this.pulseEl.setAttribute('cy', y);

    // 2. Elbow turn:
    let elbowX;
    if (placeLeft) {
      elbowX = attachX + Math.min(32, Math.max(16, (x - attachX) * 0.45));
    } else {
      elbowX = attachX - Math.min(32, Math.max(16, (attachX - x) * 0.45));
    }
    const elbowY = attachY;

    // 3. Connect line flush to card border
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
