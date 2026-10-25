/**
 * HoverCalloutView.js
 * Module 4: Renders a floating 2D Callout Badge with an SVG Leader Line and Anchor Dot
 * whenever the user hovers over any 3D organ or exploded histological layer.
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
      </svg>
      <div id="hover-callout-card" class="hover-callout-card">
        <div class="hover-callout-top">
          <span id="hover-callout-dot" class="hover-callout-dot"></span>
          <span id="hover-callout-tag" class="hover-callout-tag">MÔ HỌC DẠ DÀY</span>
          <span id="hover-callout-badge" class="hover-callout-badge"></span>
        </div>
        <div id="hover-callout-title" class="hover-callout-title">Tên Lớp / Cơ Quan</div>
        <div id="hover-callout-desc" class="hover-callout-desc"></div>
        <div class="hover-callout-hint">🖱️ Bấm để mở hồ sơ giải phẫu chi tiết</div>
      </div>
    `;
    this.container.appendChild(this.overlayEl);

    this.lineEl = this.overlayEl.querySelector('#hover-leader-line');
    this.dotEl = this.overlayEl.querySelector('#hover-anchor-dot');
    this.pulseEl = this.overlayEl.querySelector('#hover-anchor-pulse');
    this.cardEl = this.overlayEl.querySelector('#hover-callout-card');
    this.colorDotEl = this.overlayEl.querySelector('#hover-callout-dot');
    this.tagEl = this.overlayEl.querySelector('#hover-callout-tag');
    this.badgeEl = this.overlayEl.querySelector('#hover-callout-badge');
    this.titleEl = this.overlayEl.querySelector('#hover-callout-title');
    this.descEl = this.overlayEl.querySelector('#hover-callout-desc');
  }

  /**
   * Shows and positions the floating callout badge + leader line at (x, y) in container coordinates.
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

    // Determine elbow direction so the callout card never overflows the viewport
    const placeLeft = x > vw * 0.62;
    const placeDown = y < 130;

    const dx1 = placeLeft ? -28 : 28;
    const dy1 = placeDown ? 26 : -26;
    const dx2 = placeLeft ? -56 : 56;

    const elbowX = x + dx1;
    const elbowY = y + dy1;
    const endX = x + dx2;
    const endY = elbowY;

    this.dotEl.setAttribute('cx', x);
    this.dotEl.setAttribute('cy', y);
    this.pulseEl.setAttribute('cx', x);
    this.pulseEl.setAttribute('cy', y);
    this.lineEl.setAttribute('points', `${x},${y} ${elbowX},${elbowY} ${endX},${endY}`);

    const cardWidth = 290;
    let cardLeft = placeLeft ? (endX - cardWidth - 6) : (endX + 6);
    let cardTop = endY - 22;

    cardLeft = Math.max(12, Math.min(vw - cardWidth - 12, cardLeft));
    cardTop = Math.max(68, Math.min(vh - 120, cardTop));

    this.cardEl.style.left = `${cardLeft}px`;
    this.cardEl.style.top = `${cardTop}px`;
    this.cardEl.style.borderColor = accentColor;

    this.overlayEl.classList.remove('hidden');
  }
}
