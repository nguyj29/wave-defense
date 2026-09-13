import { initAudio } from './audio/sfx.ts';

// Keyboard/mouse input state. Polled by the game loop rather than driving
// logic directly from events, so fixed-timestep update sees a stable snapshot.
export class Input {
  private keysDown = new Set<string>();
  private keysPressed = new Set<string>(); // edge-triggered, cleared each tick
  mouseX = 0; // screen space
  mouseY = 0;
  mouseDown = false;
  private mousePressedFlag = false;
  wheelDelta = 0; // accumulated since last consume

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // Web Audio autoplay policy: an AudioContext can only start/resume
      // after a user gesture — the first keypress or click of the session
      // unlocks sound for every playSfx() call afterward.
      initAudio();
      if (!this.keysDown.has(e.code)) this.keysPressed.add(e.code);
      this.keysDown.add(e.code);
      // Prevent page scroll on space/arrow keys etc.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });
    target.addEventListener('mousemove', (e) => {
      const rect = target.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    target.addEventListener('mousedown', (e) => {
      initAudio();
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressedFlag = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
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
