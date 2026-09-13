import { initAudio } from './audio/sfx.ts';
import { initMusic } from './audio/music.ts';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Keyboard/mouse input state. Polled by the game loop rather than driving
// logic directly from events, so fixed-timestep update sees a stable snapshot.
//
// Round 9 (item #6): mouse aim can optionally run through the Pointer Lock
// API as a MITIGATION ATTEMPT for a reported (but not reproduced in this
// dev environment) OS-cursor-freeze bug on Wayland/Brave — see DECISIONS.md
// for the full caveat. While locked, `mouseX`/`mouseY` are a virtual
// accumulator built from relative `movementX`/`movementY` deltas instead of
// the OS-reported absolute cursor position, clamped to the canvas bounds so
// they can't run away. `screenToWorld()` and all aim-angle math downstream
// keep working unchanged since they just read mouseX/mouseY either way.
export class Input {
  private keysDown = new Set<string>();
  private keysPressed = new Set<string>(); // edge-triggered, cleared each tick
  mouseX = 0; // screen space (CSS pixels relative to the canvas) — real or virtual, see above
  mouseY = 0;
  mouseDown = false;
  private mousePressedFlag = false;
  wheelDelta = 0; // accumulated since last consume

  // True while the Pointer Lock API has captured the mouse on `target`
  // (OS cursor hidden/unbounded) — Game uses this to draw a custom in-canvas
  // crosshair and a "click to resume aiming" overlay when it's false during
  // active play.
  pointerLocked = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // Web Audio autoplay policy: an AudioContext can only start/resume
      // after a user gesture — the first keypress or click of the session
      // unlocks sound for every playSfx() call afterward. Background music
      // hooks the same first-gesture moment (see audio/music.ts).
      initAudio();
      initMusic();
      if (!this.keysDown.has(e.code)) this.keysPressed.add(e.code);
      this.keysDown.add(e.code);
      // Prevent page scroll on space/arrow keys etc.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      // Pointer lock capture is unaffected by any other key here — the
      // browser's own Escape-releases-lock behavior is handled entirely via
      // the pointerlockchange listener below, not by intercepting Escape.
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    target.addEventListener('mousemove', (e) => {
      const rect = target.getBoundingClientRect();
      if (this.pointerLocked) {
        // Relative-delta accumulation — the OS cursor is hidden/uncaptured
        // by the browser while locked, so there is no absolute position to
        // read; clamp so the virtual position can't run off the canvas.
        this.mouseX = clamp(this.mouseX + e.movementX, 0, rect.width);
        this.mouseY = clamp(this.mouseY + e.movementY, 0, rect.height);
      } else {
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
      }
    });
    target.addEventListener('mousedown', (e) => {
      initAudio();
      initMusic();
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressedFlag = true;
        // Same first-gesture-style hook as the audio unlock above: request
        // (or re-request, after an Escape/alt-tab release) pointer lock on
        // click rather than gating it behind a separate prompt/flow.
        if (document.pointerLockElement !== target) {
          target.requestPointerLock?.();
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === target;
      // On (re)engaging, keep whatever mouseX/mouseY already holds (either
      // the last real cursor position, or the last virtual position before
      // an Escape/alt-tab release) as the new accumulator base — no jump.
    });

    target.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheelDelta += e.deltaY;
      },
      { passive: false },
    );
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  /** True only on the tick the key transitioned from up to down. */
  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  wasMousePressed(): boolean {
    if (this.mousePressedFlag) {
      this.mousePressedFlag = false;
      return true;
    }
    return false;
  }

  consumeWheel(): number {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  /** Call once per fixed tick after all systems have read edge-triggers. */
  endTick(): void {
    this.keysPressed.clear();
  }

  moveAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }
}
