// ============================================================================
// rendererDetailed.ts — an alternate, more detailed hand-drawn art style
// (still plain Canvas2D shape primitives, no external image assets): subtle
// shading via layered flat fills (no per-frame gradient objects, so it stays
// cheap at ~300 entities), drop shadows under circular units, and a bit more
// shape detail on trees/rocks/the boss. Shares the camera/world-space
// transform helpers with render/renderer.ts. Toggle at runtime with F10
// (see game.ts) — both styles are fully functional so they can be compared.
// ============================================================================
import type { Camera } from '../camera.ts';
import type { Entity } from '../entities/types.ts';
import { WALL_SEGMENTS } from '../world/map.ts';
import type { Obstacle } from '../world/obstacles.ts';
import { interpolatedPos } from './renderer.ts';

/** Lightens (positive percent) or darkens (negative) a #rrggbb color. Cheap string math, no canvas objects. */
function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const amt = Math.round(2.55 * percent);
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function safeShade(hex: string, percent: number): string {
  // Non-#rrggbb colors (e.g. '#fff' shorthand, 'white') fall back untouched
  // rather than producing garbage — entities in this game all use #rrggbb,
  // but this keeps the helper defensive.
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? shade(hex, percent) : hex;
}

export function drawWallsDetailed(ctx: CanvasRenderingContext2D, camera: Camera): void {
  for (const w of WALL_SEGMENTS) {
    const a = camera.worldToScreen(w.x, w.y);
    const b = camera.worldToScreen(w.x + w.w, w.y + w.h);
    const width = b.x - a.x;
    const height = b.y - a.y;
    ctx.fillStyle = '#6b4f3a';
    ctx.fillRect(a.x, a.y, width, height);
    // Top highlight + bottom shadow strips for a beveled-stone look.
    const bevel = Math.max(2, Math.min(6, Math.min(Math.abs(width), Math.abs(height)) * 0.15));
    ctx.fillStyle = safeShade('#6b4f3a', 18);
    ctx.fillRect(a.x, a.y, width, bevel);
    ctx.fillStyle = safeShade('#6b4f3a', -18);
    ctx.fillRect(a.x, a.y + height - bevel, width, bevel);
    ctx.strokeStyle = safeShade('#6b4f3a', -30);
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x, a.y, width, height);
  }
}

function drawTreeDetailed(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  // Trunk.
  ctx.fillStyle = '#4e342e';
  ctx.beginPath();
  ctx.arc(x, y + r * 0.15, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  // Three overlapping foliage circles at slightly different tones/offsets
  // for an organic canopy silhouette instead of one flat disc.
  const foliage: [number, number, number, string][] = [
    [-r * 0.35, -r * 0.1, r * 0.72, '#2e7d32'],
    [r * 0.32, -r * 0.05, r * 0.68, '#357a38'],
    [0, -r * 0.4, r * 0.75, '#3a8a3f'],
  ];
  for (const [dx, dy, rr, color] of foliage) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  // Small highlight dab.
  ctx.fillStyle = safeShade('#3a8a3f', 25);
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.55, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawRockDetailed(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, id: number, offsets?: number[]): void {
  const sides = offsets?.length ?? 7;
  ctx.fillStyle = '#8a8a8a';
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = id + (i / sides) * Math.PI * 2;
    const rr = r * (offsets ? offsets[i % offsets.length] : 1);
    const vx = x + Math.cos(a) * rr;
    const vy = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // A couple of darker/lighter facet triangles fanning from center for
  // tone-variation "cut stone" detail, cheap flat fills (no gradients).
  const facetCount = 3;
  for (let i = 0; i < facetCount; i++) {
    const a0 = id + (i / facetCount) * Math.PI * 2 + 0.3;
    const a1 = a0 + Math.PI / facetCount;
    ctx.fillStyle = i % 2 === 0 ? safeShade('#8a8a8a', 12) : safeShade('#8a8a8a', -14);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a0) * r * 0.75, y + Math.sin(a0) * r * 0.75);
    ctx.lineTo(x + Math.cos(a1) * r * 0.75, y + Math.sin(a1) * r * 0.75);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawObstaclesDetailed(ctx: CanvasRenderingContext2D, camera: Camera, obstacles: Obstacle[]): void {
  const s = camera.pixelScale;
  for (const o of obstacles) {
    const p = camera.worldToScreen(o.x, o.y);
    if (p.x < -60 || p.y < -60 || p.x > camera.screenWidth + 60 || p.y > camera.screenHeight + 60) continue;
    if (o.type === 'tree') drawTreeDetailed(ctx, p.x, p.y, o.radius * s);
    else drawRockDetailed(ctx, p.x, p.y, o.radius * s, o.id, o.vertOffsets);
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.65, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

function shapeColorWithFlash(e: Entity): string {
  if (e.hitFlashTimer && e.hitFlashTimer > 0) return '#ffffff';
  return e.color;
}

export function drawEntityDetailed(ctx: CanvasRenderingContext2D, camera: Camera, e: Entity, alpha: number): void {
  const { x, y } = interpolatedPos(e, alpha);
  const p = camera.worldToScreen(x, y);
  const r = e.radius * camera.pixelScale;
  if (p.x < -80 || p.y < -80 || p.x > camera.screenWidth + 80 || p.y > camera.screenHeight + 80) return;

  const flashing = !!(e.hitFlashTimer && e.hitFlashTimer > 0);
  const base = shapeColorWithFlash(e);
  const light = flashing ? base : safeShade(base, 22);
  const dark = flashing ? base : safeShade(base, -22);

  ctx.save();
  ctx.globalAlpha = e.alpha ?? 1;

  if (e.kind !== 'projectile' && e.kind !== 'coin') drawShadow(ctx, p.x, p.y, r);

  ctx.translate(p.x, p.y);
  ctx.rotate(e.angle);

  switch (e.shape) {
    case 'circle': {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.stroke();
      // Highlight: a small lighter arc top-left, cheaper than a radial
      // gradient and reads fine at this size.
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.3, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'triangle': {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.8, r * 0.75);
      ctx.lineTo(-r * 0.8, -r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(r * 0.4, 0);
      ctx.lineTo(-r * 0.5, r * 0.3);
      ctx.lineTo(-r * 0.5, -r * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'hexagon': {
      ctx.fillStyle = base;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const vx = Math.cos(a) * r;
        const vy = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.stroke();
      // Inner "bevel" hexagon for extra boss/core detail.
      ctx.fillStyle = light;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const vx = Math.cos(a) * r * 0.55;
        const vy = Math.sin(a) * r * 0.55;
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.globalAlpha = (e.alpha ?? 1) * 0.5;
      ctx.fill();
      ctx.globalAlpha = e.alpha ?? 1;
      break;
    }
    case 'square': {
      ctx.fillStyle = base;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      break;
    }
    case 'squatSquare': {
      const w = r * 2.5;
      const h = r * 1.6;
      ctx.fillStyle = base;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = light;
      ctx.fillRect(-w / 2 + w * 0.1, -h / 2 + h * 0.12, w * 0.35, h * 0.3);
      break;
    }
    case 'diamond': {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.5);
      ctx.lineTo(r * 0.5, 0);
      ctx.lineTo(0, r * 0.5);
      ctx.lineTo(-r * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'chevron': {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.6, r * 0.7);
      ctx.lineTo(-r * 0.15, 0);
      ctx.lineTo(-r * 0.6, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.stroke();
      break;
    }
    case 'concaveQuad': {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.3, r * 0.85);
      ctx.lineTo(-r * 0.55, 0);
      ctx.lineTo(-r * 0.3, -r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.stroke();
      break;
    }
  }

  if (e.kind === 'player') {
    const pullback = (e.barrelPullback ?? 0) * camera.pixelScale;
    const barrelLen = Math.max(0, r + 14 * camera.pixelScale - pullback);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = Math.max(3, 4.5 * camera.pixelScale);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(barrelLen, 0);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, 2.2 * camera.pixelScale);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(barrelLen, 0);
    ctx.stroke();
  }

  ctx.restore();

  if (e.health && e.health.hp < e.health.maxHp && e.kind !== 'core' && !e.dead) {
    const w = Math.max(20, r * 2);
    const h = 4;
    const barY = p.y - r - 10;
    const pct = Math.max(0, e.health.hp / e.health.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(p.x - w / 2, barY, w, h);
    ctx.fillStyle = pct > 0.5 ? '#5ec96a' : pct > 0.25 ? '#e0c341' : '#e05a4b';
    ctx.fillRect(p.x - w / 2, barY, w * pct, h);
  }
}
