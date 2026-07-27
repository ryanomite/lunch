let _MapLabelClass = null;

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function getMapLabelClass() {
  if (_MapLabelClass) return _MapLabelClass;

  _MapLabelClass = class MapLabel extends google.maps.OverlayView {
    constructor(lines, position, bgColor, cssClass = 'map-pin-label') {
      super();
      this._lines    = Array.isArray(lines) ? lines : [lines];
      this._position = new google.maps.LatLng(position.lat, position.lng);
      this._bgColor  = bgColor;
      this._cssClass = cssClass;
      this._div      = null;
      this._visible  = true;
    }

    onAdd() {
      this._div = document.createElement('div');
      this._div.className = this._cssClass;
      this._div.innerHTML = this._lines
        .filter(Boolean)
        .map(l => `<div>${_esc(l)}</div>`)
        .join('');
      this._div.style.backgroundColor = this._bgColor;
      this.getPanes().floatPane.appendChild(this._div);
    }

    draw() {
      if (!this._div || !this._position) return;
      const proj = this.getProjection();
      if (!proj) return;
      const pos = proj.fromLatLngToDivPixel(this._position);
      if (!pos) return;
      this._div.style.left = `${pos.x - this._div.offsetWidth / 2}px`;
      this._div.style.top  = `${pos.y - this._div.offsetHeight - 38}px`;
    }

    onRemove() {
      if (this._div?.parentNode) {
        this._div.parentNode.removeChild(this._div);
        this._div = null;
      }
    }

    update(lines, bgColor) {
      this._lines  = Array.isArray(lines) ? lines : [lines];
      this._bgColor = bgColor;
      if (this._div) {
        this._div.innerHTML = this._lines.filter(Boolean).map(l => `<div>${_esc(l)}</div>`).join('');
        this._div.style.backgroundColor = this._bgColor;
      }
    }

    setVisible(visible) {
      this._visible = visible !== false;
      if (this._div) {
        this._div.style.visibility = this._visible ? 'visible' : 'hidden';
        this._div.style.pointerEvents = this._visible ? '' : 'none';
      }
    }

    getDiv() { return this._div; }
  };

  return _MapLabelClass;
}
