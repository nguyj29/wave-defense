import { CAMERA } from './config.ts';
import { clamp, lerp } from './engine/vec.ts';

// Camera follows the player (centered, no dead zone) with light smoothing.
// Zoom is anchored on the player (screen center) — the player never moves on
// screen as zoom changes, the world scales around them.
export class Camera {
  x = 0; // world-space center the camera is currently looking at
  y = 0;
  zoom = CAMERA.zoomDefault;
  screenWidth = 800;
  screenHeight = 600;

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  update(dt: number, targetX: number, targetY: number): void {
    const t = 1 - Math.exp(-CAMERA.lerpPerSecond * dt);
    this.x = lerp(this.x, targetX, t);
    this.y = lerp(this.y, targetY, t);
  }

  applyZoom(wheelDelta: number): void {
    // Negative deltaY (scroll up) should zoom in.
    this.zoom = clamp(this.zoom - wheelDelta * CAMERA.zoomStep, CAMERA.zoomMin, CAMERA.zoomMax);
  }

  /** Pixels per world unit. At zoom 1.0 this shows ~CAMERA.baseViewWidth world units across the canvas width. */
  get pixelScale(): number {
    return (this.screenWidth / CAMERA.baseViewWidth) * this.zoom;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const s = this.pixelScale;
    return {
      x: (wx - this.x) * s + this.screenWidth / 2,
      y: (wy - this.y) * s + this.screenHeight / 2,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const s = this.pixelScale;
    return {
      x: (sx - this.screenWidth / 2) / s + this.x,
      y: (sy - this.screenHeight / 2) / s + this.y,
    };
  }
}
