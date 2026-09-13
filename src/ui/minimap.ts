import { CORE, WORLD } from '../config.ts';
import type { Obstacle } from '../world/obstacles.ts';

const SIZE = 170;
const MARGIN = 16;

export interface MinimapEnemy {
  x: number;
  y: number;
  isBoss: boolean;
}

export interface MinimapPoint {
  x: number;
  y: number;
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  screenW: number,
  playerX: number,
  playerY: number,
  obstacles: Obstacle[],
  enemies: MinimapEnemy[],
  bossWarning: boolean,
  allies: MinimapPoint[] = [],
  gems: MinimapPoint[] = [],
): void {
  const x = screenW - SIZE - MARGIN;
  const y = MARGIN;
  const scale = SIZE / WORLD.width;

  ctx.save();
  ctx.fillStyle = 'rgba(10,20,10,0.75)';
  ctx.fillRect(x, y, SIZE, SIZE);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(x, y, SIZE, SIZE);

  ctx.fillStyle = 'rgba(140,140,140,0.5)';
  for (let i = 0; i < obstacles.length; i += 2) {
    const o = obstacles[i];
    ctx.fillRect(x + o.x * scale, y + o.y * scale, 1, 1);
  }

  // Core
  ctx.fillStyle = '#5ec96a';
  ctx.beginPath();
  ctx.arc(x + CORE.x * scale, y + CORE.y * scale, 4, 0, Math.PI * 2);
  ctx.fill();

  // Player
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + playerX * scale, y + playerY * scale, 3, 0, Math.PI * 2);
  ctx.fill();

  // Ally blips — same blue as their in-world color (#3fa9f5, see
  // config.ts::ALLY.color), clearly distinct from the enemy purple/red below.
  ctx.fillStyle = '#3fa9f5';
  for (const a of allies) {
    ctx.beginPath();
    ctx.arc(x + a.x * scale, y + a.y * scale, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Gem blips — matches the gem's in-world cyan (#5fe0ff, see
  // entities/factory.ts::createCoin), so a player can navigate to one even
  // though (unlike coins) it doesn't auto-magnetize.
  ctx.fillStyle = '#5fe0ff';
  for (const g of gems) {
    ctx.beginPath();
    ctx.arc(x + g.x * scale, y + g.y * scale, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Enemy blips
  for (const e of enemies) {
    ctx.fillStyle = e.isBoss ? '#ff2020' : '#c060ff';
    const r = e.isBoss ? 4 : 2;
    ctx.beginPath();
    ctx.arc(x + e.x * scale, y + e.y * scale, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (bossWarning) {
    ctx.strokeStyle = '#ff2020';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, SIZE, SIZE);
  }

  ctx.restore();
}

export function drawBossWarningBanner(ctx: CanvasRenderingContext2D, screenW: number): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px sans-serif';
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 150);
  ctx.fillStyle = `rgba(255,40,40,${pulse})`;
  ctx.fillText('WARNING: BOSS INCOMING', screenW / 2, 100);
  ctx.restore();
}
