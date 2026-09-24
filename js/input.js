// Keyboard & mouse state with per-frame "pressed" edges.

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.justPressed = new Set();
    this.buttons = new Set();
    this.justClicked = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = false;
    this.lockAt = 0;
    this.onKey = null; // hook for UI keys (Esc, Tab...) — returns true if handled

    const block = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (block.has(e.code) || (this.enabled && e.ctrlKey)) e.preventDefault();
      if (this.onKey && this.onKey(e)) { e.preventDefault(); return; }
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    el.addEventListener('mousedown', (e) => {
      this.buttons.add(e.button);
      this.justClicked.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    window.addEventListener('mousemove', (e) => {
      // Without pointer lock, look only while a mouse button is held (drag-to-look).
      if (!this.enabled) return;
      if (!(this.locked || this.buttons.size > 0)) return;
      // Chrome sometimes reports a huge jump right after pointer lock starts: drop it.
      if (performance.now() - this.lockAt < 120) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
      this.dx += mx;
      this.dy += my;
    });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this.lockAt = performance.now();
    });
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  mouseDown(b) { return this.buttons.has(b); }
  mousePressed(b) { return this.justClicked.has(b); }

  requestLock() {
    try {
      const p = this.el.requestPointerLock && this.el.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* not available in this frame: drag-to-look still works */
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  endFrame() {
    this.justPressed.clear();
    this.justClicked.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }

  reset() {
    this.keys.clear();
    this.buttons.clear();
    this.endFrame();
  }
}
