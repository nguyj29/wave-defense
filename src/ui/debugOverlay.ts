export interface DebugData {
  fps: number;
  entityCount: number;
  enemyCount: number;
  allyCount: number;
  projectileCount: number;
  updateMs: number;
  renderMs: number;
  godMode: boolean;
  spawnCycleType: string;
  renderStyle: string;
}

export function drawDebugOverlay(ctx: CanvasRenderingContext2D, d: DebugData): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8, 8, 230, 164);
  ctx.fillStyle = '#7CFC00';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = [
    `FPS: ${d.fps.toFixed(0)}`,
    `entities: ${d.entityCount} (enemy ${d.enemyCount}, ally ${d.allyCount}, proj ${d.projectileCount})`,
    `update: ${d.updateMs.toFixed(2)}ms  render: ${d.renderMs.toFixed(2)}ms`,
    `god mode: ${d.godMode ? 'ON' : 'off'}`,
    `F6 spawn type: ${d.spawnCycleType}`,
    `render style: ${d.renderStyle}`,
    '',
    'F1 overlay  F2 radii  F3 flow field',
    'F4 skip wave  F5 god  F6 spawn+scroll',
    'F7 spawn readout  F8 force boss',
    'F10 toggle render style',
  ];
  lines.forEach((line, i) => ctx.fillText(line, 16, 16 + i * 14));
  ctx.restore();
}

export interface SpawnReadoutData {
  smoothedKillRate: number;
  currentRate: number;
  normalizedTarget: number;
  budgetSpent: number;
  budgetTotal: number;
  aliveCount: number;
  aliveCap: number;
  waveTimeRemaining: number;
  history: number[]; // recent currentRate samples for a rolling graph
  activeSpawnPointId: string;
  clumpProgress: number;
  clumpTarget: number;
  pauseTimer: number;
}

export function drawSpawnReadout(ctx: CanvasRenderingContext2D, screenW: number, d: SpawnReadoutData): void {
  const w = 260;
  const h = 216;
  const x = screenW - w - 8;
  const y = 200;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#7CFC00';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = [
    'F7 — Spawn Director',
    `kill rate (smoothed): ${d.smoothedKillRate.toFixed(2)}/s`,
    `spawn rate: ${d.currentRate.toFixed(3)}/s`,
    `position base<->max: ${(d.normalizedTarget * 100).toFixed(0)}%`,
    `budget: ${d.budgetSpent}/${d.budgetTotal}`,
    `alive: ${d.aliveCount}/${d.aliveCap}`,
    `wave time left: ${d.waveTimeRemaining.toFixed(0)}s`,
    `spawn point: ${d.activeSpawnPointId}`,
    d.pauseTimer > 0 ? `paused: ${d.pauseTimer.toFixed(1)}s` : `clump: ${d.clumpProgress}/${d.clumpTarget}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, x + 8, y + 8 + i * 14));

  // Small rolling graph of currentRate.
  const graphX = x + 8;
  const graphY = y + h - 32;
  const graphW = w - 16;
  const graphH = 24;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(graphX, graphY, graphW, graphH);
  ctx.strokeStyle = '#7CFC00';
  ctx.beginPath();
  const maxRate = 0.8;
  d.history.forEach((v, i) => {
    const px = graphX + (i / Math.max(1, d.history.length - 1)) * graphW;
    const py = graphY + graphH - (v / maxRate) * graphH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}
