import type { Camera } from '../camera.ts';
import { SHOP, WORLD } from '../config.ts';
import type { Entity } from '../entities/types.ts';
import { LANE_SEGMENTS, WALL_SEGMENTS } from '../world/map.ts';
import type { Obstacle } from '../world/obstacles.ts';
import type { AllySpawner } from '../entities/spawnerSystem.ts';
import type { FlowField } from '../world/flowfield.ts';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolatedPos(e: Entity, alpha: number): { x: number; y: number } {
  return { x: lerp(e.prevX, e.x, alpha), y: lerp(e.prevY, e.y, alpha) };
}

function drawPolygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, sides: number, rotation: number, offsets?: number[]): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const r = radius * (offsets ? offsets[i % offsets.length] : 1);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
    ctx.closePath();
}

/** Concrete/road-colored strips along each lane corridor, drawn under everything else. */
export function drawLanes(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const s = camera.pixelScale;
  ctx.strokeStyle = '#6d6d6d';
  ctx.lineCap = 'round';
  for (const lane of LANE_SEGMENTS) {
    const a = camera.worldToScreen(lane.x1, lane.y1);
    const b = camera.worldToScreen(lane.x2, lane.y2);
    ctx.lineWidth = lane.width * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // A slightly darker centerline dash for a "road" read.
  ctx.strokeStyle = '#565656';
  ctx.setLineDash([24 * s, 20 * s]);
  for (const lane of LANE_SEGMENTS) {
    const a = camera.worldToScreen(lane.x1, lane.y1);
    const b = camera.worldToScreen(lane.x2, lane.y2);
    ctx.lineWidth = Math.max(1, 4 * s);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export function drawWorldBackground(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const topLeft = camera.screenToWorld(0, 0);
  const bottomRight = camera.screenToWorld(camera.screenWidth, camera.screenHeight);
  ctx.fillStyle = '#1b3a1f';
  ctx.fillRect(0, 0, camera.screenWidth, camera.screenHeight);
  drawLanes(ctx, camera);
  // Subtle ground grid for spatial reference.
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const grid = 200;
  const startX = Math.floor(Math.max(0, topLeft.x) / grid) * grid;
  const startY = Math.floor(Math.max(0, topLeft.y) / grid) * grid;
  for (let x = startX; x <= Math.min(WORLD.width, bottomRight.x); x += grid) {
    const a = camera.worldToScreen(x, 0);
    const b = camera.worldToScreen(x, WORLD.height);
    ctx.beginPath();
    ctx.moveTo(a.x, 0);
    ctx.lineTo(b.x, camera.screenHeight);
    ctx.stroke();
  }
  for (let y = startY; y <= Math.min(WORLD.height, bottomRight.y); y += grid) {
    const a = camera.worldToScreen(0, y);
    ctx.beginPath();
    ctx.moveTo(0, a.y);
    ctx.lineTo(camera.screenWidth, a.y);
    ctx.stroke();
  }
}

export function drawWorldBounds(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const tl = camera.worldToScreen(0, 0);
  const br = camera.worldToScreen(WORLD.width, WORLD.height);
  ctx.strokeStyle = '#0a1a0c';
  ctx.lineWidth = 6;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
}

export function drawObstacles(ctx: CanvasRenderingContext2D, camera: Camera, obstacles: Obstacle[]): void {
  const s = camera.pixelScale;
  for (const o of obstacles) {
    const p = camera.worldToScreen(o.x, o.y);
    if (p.x < -60 || p.y < -60 || p.x > camera.screenWidth + 60 || p.y > camera.screenHeight + 60) continue;
    if (o.type === 'tree') {
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(p.x, p.y, o.radius * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4e342e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, o.radius * 0.3 * s, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#8a8a8a';
      drawPolygon(ctx, p.x, p.y, o.radius * s, o.vertOffsets?.length ?? 7, o.id, o.vertOffsets);
      ctx.fill();
      ctx.strokeStyle = '#5c5c5c';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

export function drawWalls(ctx: CanvasRenderingContext2D, camera: Camera): void {
  ctx.fillStyle = '#6b4f3a';
  for (const w of WALL_SEGMENTS) {
    const a = camera.worldToScreen(w.x, w.y);
    const b = camera.worldToScreen(w.x + w.w, w.y + w.h);
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
}

export function drawSpawners(ctx: CanvasRenderingContext2D, camera: Camera, spawners: AllySpawner[]): void {
  const s = camera.pixelScale;
  for (const sp of spawners) {
    const p = camera.worldToScreen(sp.x, sp.y);
    const r = 24 * s;
    ctx.fillStyle = '#2f6fb0';
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    ctx.strokeStyle = '#9fd3ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
  }
}

export function drawShopMarker(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const p = camera.worldToScreen(SHOP.marker.x, SHOP.marker.y);
  const r = SHOP.marker.radius * camera.pixelScale;
  ctx.fillStyle = '#e0b84b';
  ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.strokeStyle = '#fff3cf';
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
}

function shapeColorWithFlash(e: Entity): string {
  if (e.hitFlashTimer && e.hitFlashTimer > 0) return '#ffffff';
  return e.color;
}

export function drawEntity(ctx: CanvasRenderingContext2D, camera: Camera, e: Entity, alpha: number): void {
  const { x, y } = interpolatedPos(e, alpha);
  const p = camera.worldToScreen(x, y);
  const r = e.radius * camera.pixelScale;
  if (p.x < -80 || p.y < -80 || p.x > camera.screenWidth + 80 || p.y > camera.screenHeight + 80) return;

  ctx.save();
  ctx.globalAlpha = e.alpha ?? 1;
  ctx.fillStyle = shapeColorWithFlash(e);
  ctx.translate(p.x, p.y);
  ctx.rotate(e.angle);

  switch (e.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.8, r * 0.75);
      ctx.lineTo(-r * 0.8, -r * 0.75);
      ctx.closePath();
      ctx.fill();
      break;
    case 'hexagon':
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
      break;
    case 'square':
      ctx.fillRect(-r, -r, r * 2, r * 2);
      break;
  }

  if (e.kind === 'player') {
    // Recoil pulls the barrel line back toward the player on fire and eases
    // back out (see combat/playerWeapons.ts / game.ts render()).
    const pullback = (e.barrelPullback ?? 0) * camera.pixelScale;
    const barrelLen = Math.max(0, r + 14 * camera.pixelScale - pullback);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, 3 * camera.pixelScale);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(barrelLen, 0);
    ctx.stroke();
  }

  ctx.restore();

  // Floating health bar over damaged (but alive) entities.
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

export function drawCollisionRadii(ctx: CanvasRenderingContext2D, camera: Camera, entities: Entity[]): void {
  ctx.strokeStyle = 'rgba(255,0,255,0.6)';
  ctx.lineWidth = 1;
  for (const e of entities) {
    if (e.dead) continue;
    const p = camera.worldToScreen(e.x, e.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, e.radius * camera.pixelScale, 0, Math.PI * 2);
    ctx.stroke();
    if (e.aggroRadius) {
      ctx.strokeStyle = 'rgba(255,120,0,0.3)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, e.aggroRadius * camera.pixelScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,0,255,0.6)';
    }
  }
}

export function drawFlowFieldDebug(ctx: CanvasRenderingContext2D, camera: Camera, field: FlowField): void {
  const step = 64;
  ctx.strokeStyle = 'rgba(0,255,255,0.5)';
  ctx.lineWidth = 1;
  const tl = camera.screenToWorld(0, 0);
  const br = camera.screenToWorld(camera.screenWidth, camera.screenHeight);
  for (let x = Math.max(0, Math.floor(tl.x / step) * step); x < Math.min(WORLD.width, br.x); x += step) {
    for (let y = Math.max(0, Math.floor(tl.y / step) * step); y < Math.min(WORLD.height, br.y); y += step) {
      const dir = field.getDirection(x, y);
      if (dir.x === 0 && dir.y === 0) continue;
      const a = camera.worldToScreen(x, y);
      const len = 12 * camera.pixelScale;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + dir.x * len, a.y + dir.y * len);
      ctx.stroke();
    }
  }
}
