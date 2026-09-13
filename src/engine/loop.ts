// Fixed-timestep update loop (60Hz) with interpolated rendering, decoupled
// from display frame rate. Callers get `alpha` (0..1) to interpolate render
// state between the previous and current simulation tick.
const FIXED_DT = 1 / 60;
const MAX_FRAME_TIME = 0.25; // clamp huge gaps (tab backgrounded, debugger pause)

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafHandle = 0;

  private update: (dt: number) => void;
  private render: (alpha: number) => void;

  constructor(update: (dt: number) => void, render: (alpha: number) => void) {
    this.update = update;
    this.render = render;
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;
    this.accumulator += frameTime;

    while (this.accumulator >= FIXED_DT) {
      this.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    const alpha = this.accumulator / FIXED_DT;
    this.render(alpha);
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}

export { FIXED_DT };
