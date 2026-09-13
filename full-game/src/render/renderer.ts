import type { Camera } from '../camera.ts';
import { ROAD_GRID, SHOP, WORLD } from '../config.ts';
import type { Entity } from '../entities/types.ts';
import { ROAD_LINES, WALL_SEGMENTS } from '../world/map.ts';
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

/** Concrete road-colored strips across the whole map grid, drawn under everything else (see config.ts::ROAD_GRID). */
export function drawRoadGrid(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const s = camera.pixelScale;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#6d6d6d';
  ctx.lineWidth = ROAD_GRID.width * s;
  for (const lx of ROAD_LINES.vertical) {
    const a = camera.worldToScreen(lx, 0);
    const b = camera.worldToScreen(lx, WORLD.height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const ly of ROAD_LINES.horizontal) {
    const a = camera.worldToScreen(0, ly);
    const b = camera.worldToScreen(WORLD.width, ly);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // A slightly darker centerline dash for a "road" read.
  ctx.strokeStyle = '#565656';
  ctx.lineWidth = Math.max(1, 4 * s);
  ctx.setLineDash([24 * s, 20 * s]);
  for (const lx of ROAD_LINES.vertical) {
    const a = camera.worldToScreen(lx, 0);
    const b = camera.worldToScreen(lx, WORLD.height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const ly of ROAD_LINES.horizontal) {
    const a = camera.worldToScreen(0, ly);
    const b = camera.worldToScreen(WORLD.width, ly);
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
  drawRoadGrid(ctx, camera);
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
    case 'squatSquare':
      // "Squat/wide" bomber silhouette: wider than tall, same radius budget.
      ctx.fillRect(-r * 1.25, -r * 0.8, r * 2.5, r * 1.6);
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 'chevron':
      // Rusher: a narrow, notched arrow — concave at the back, not a plain
      // triangle, so it reads distinctly "fast/aggressive" at a glance.
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.6, r * 0.7);
      ctx.lineTo(-r * 0.15, 0);
      ctx.lineTo(-r * 0.6, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      break;
    case 'concaveQuad':
      // Fire mage: a 4-sided polygon with one reflex (concave) vertex on the
      // trailing edge.
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.3, r * 0.85);
      ctx.lineTo(-r * 0.55, 0); // reflex vertex, pulled in toward center
      ctx.lineTo(-r * 0.3, -r * 0.85);
      ctx.closePath();
      ctx.fill();
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

/**
 * Bomber fuse tell: an expanding ring plus an accelerating flash, drawn on
 * top of any lit bomber (dead or alive — a detonating corpse still shows
 * this). `progress` is 0 (just lit) .. 1 (about to detonate); flash
 * frequency and ring radius both ramp up with it so the countdown reads as
 * urgent right before it goes off.
 */
export function drawBomberFuse(ctx: CanvasRenderingContext2D, camera: Camera, x: number, y: number, radius: number, progress: number): void {
  const p = camera.worldToScreen(x, y);
  const s = camera.pixelScale;
  const ringR = (radius + 6 + progress * 40) * s;
  ctx.save();
  ctx.globalAlpha = 0.7 * (1 - progress * 0.3);
  ctx.strokeStyle = '#ff5533';
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.beginPath();
  ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
  ctx.stroke();
  // Accelerating flash: blend toward white with increasing frequency as
  // progress -> 1.
  const flashHz = 2 + progress * 10;
  const flash = (Math.sin(performance.now() * 0.001 * Math.PI * 2 * flashHz) + 1) / 2;
  if (flash > 1 - progress * 0.6) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Healer's heal-tether: a thin pulsing line from healer to each entity it's currently healing. */
export function drawHealerTethers(ctx: CanvasRenderingContext2D, camera: Camera, entities: Entity[]): void {
  const byId = new Map<number, Entity>();
  for (const e of entities) byId.set(e.id, e);
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
  ctx.save();
  ctx.strokeStyle = `rgba(150,255,180,${0.35 + pulse * 0.35})`;
  ctx.lineWidth = Math.max(1, 2 * camera.pixelScale);
  for (const e of entities) {
    if (e.archetype !== 'healer' || e.dead || !e.healingTargetIds?.length) continue;
    const from = camera.worldToScreen(e.x, e.y);
    for (const id of e.healingTargetIds) {
      const t = byId.get(id);
      if (!t || t.dead) continue;
      const to = camera.worldToScreen(t.x, t.y);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A fire mage's in-flight fireball — a small, warm-colored dot with a light glow. */
export function drawFireball(ctx: CanvasRenderingContext2D, camera: Camera, x: number, y: number): void {
  const p = camera.worldToScreen(x, y);
  const r = 7 * camera.pixelScale;
  ctx.save();
  ctx.fillStyle = 'rgba(255,140,40,0.35)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff9d3d';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Burning ground effect left by a fire mage's fireball — a flickering translucent orange-red disc. */
export function drawGroundFire(ctx: CanvasRenderingContext2D, camera: Camera, x: number, y: number, radius: number, lifeFrac: number): void {
  const p = camera.worldToScreen(x, y);
  const r = radius * camera.pixelScale;
  const flicker = 0.75 + 0.25 * Math.sin(performance.now() * 0.02 + x);
  ctx.save();
  ctx.globalAlpha = Math.min(1, lifeFrac * 1.5) * 0.4 * flicker;
  ctx.fillStyle = '#ff5a1f';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = Math.min(1, lifeFrac * 1.5) * 0.6;
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = Math.max(1, 2 * camera.pixelScale);
  ctx.stroke();
  ctx.restore();
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
