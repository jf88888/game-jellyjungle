// Input: keyboard (WASD/arrows, Space, R, P, H, M) + touch joystick & jump
// button with pointer capture. Jump is edge-triggered: each press/tap sets a
// one-shot flag consumed by the physics step.

export class Input {
  constructor(onKeyAction) {
    this.mx = 0; this.my = 0;       // -1..1, my negative = forward (-Z)
    this._joyActive = false;
    this._jumpQueued = false;
    this._keys = new Set();
    this.onKeyAction = onKeyAction; // (action) => void for pause/help/mute/return

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('blur', () => this._clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._clear(); });

    // Touch joystick
    const zone = document.getElementById('joystick-zone');
    const nub = document.getElementById('joystick-nub');
    this._nub = nub;
    let activeId = null;
    const R = 52;
    zone.addEventListener('pointerdown', (e) => {
      activeId = e.pointerId;
      this._joyActive = true;
      zone.setPointerCapture(e.pointerId);
      this._joyMove(e, zone, R);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === activeId) this._joyMove(e, zone, R); });
    const joyEnd = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      this._joyActive = false;
      this.mx = 0; this.my = 0;
      nub.style.transform = 'translate(0px, 0px)';
    };
    zone.addEventListener('pointerup', joyEnd);
    zone.addEventListener('pointercancel', joyEnd);

    // Jump button: each tap consumes at most one jump
    const btn = document.getElementById('btn-jump');
    let held = false;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!held) { held = true; this._jumpQueued = true; }
    });
    const btnEnd = () => { held = false; };
    btn.addEventListener('pointerup', btnEnd);
    btn.addEventListener('pointercancel', btnEnd);
    btn.addEventListener('lostpointercapture', btnEnd);
  }

  _joyMove(e, zone, R) {
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    this._nub.style.transform = `translate(${dx}px, ${dy}px)`;
    this.mx = dx / R;
    this.my = dy / R; // +dy is down on screen = backward (+Z) → my positive = +Z
  }

  _onKeyDown(e) {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
    if (code === 'Space') {
      if (!e.repeat) this._jumpQueued = true;
      return;
    }
    if (this._keys.has(code)) return;
    this._keys.add(code);
    switch (code) {
      case 'KeyR': this.onKeyAction('return'); break;
      case 'KeyP': case 'Escape': this.onKeyAction('pause'); break;
      case 'KeyH': this.onKeyAction('help'); break;
      case 'KeyM': this.onKeyAction('mute'); break;
    }
    this._refreshMove();
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
    this._refreshMove();
  }

  _refreshMove() {
    let x = 0, z = 0;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) x -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) x += 1;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) z -= 1; // forward = -Z
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) z += 1;
    const l = Math.hypot(x, z);
    if (l > 0) { x /= l; z /= l; }
    // keyboard overrides joystick while any move key is held
    if (l > 0) { this.mx = x; this.my = z; }
    else if (!this._joyActive) { this.mx = 0; this.my = 0; }
  }

  /** Consume the jump edge. Returns true once per press. */
  consumeJump() {
    if (this._jumpQueued) { this._jumpQueued = false; return true; }
    return false;
  }

  _clear() {
    this._keys.clear();
    this.mx = 0; this.my = 0;
    this._jumpQueued = false;
    if (this._nub) this._nub.style.transform = 'translate(0px, 0px)';
  }

  get anyMove() { return Math.hypot(this.mx, this.my) > 0.08; }
}
