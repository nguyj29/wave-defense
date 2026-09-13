export interface HudData {
  playerHp: number;
  playerMaxHp: number;
  coreHp: number;
  coreMaxHp: number;
  weaponLabel: string;
  ammoText: string;
  summonCooldownRemaining: number;
  summonCooldownTotal: number;
  summonMaxAlive: number;
  summonAliveCount: number;
  coins: number;
  waveNumber: number;
  totalWaves: number;
  enemiesAlive: number;
  wavePhase: 'running' | 'intermission' | 'allWavesComplete';
  timeRemaining: number;
  earlyCallBonusPreview: number;
  bossAlive: boolean;
  bossHp: number;
  bossMaxHp: number;
  shopPromptVisible: boolean;
  godMode: boolean;
}

function fmtTime(t: number): string {
  const s = Math.max(0, Math.ceil(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color: string, label: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6, y + h / 2);
}

export function drawHud(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, d: HudData): void {
  ctx.save();

  // Player HP (bottom-left)
  drawBar(ctx, 16, screenH - 56, 220, 22, d.playerHp / d.playerMaxHp, '#5ec96a', `HP ${Math.ceil(d.playerHp)}/${d.playerMaxHp}`);
  // Core HP (bottom-left, above player)
  drawBar(ctx, 16, screenH - 86, 220, 22, d.coreHp / d.coreMaxHp, '#4ea3d1', `Core ${Math.ceil(d.coreHp)}/${Math.round(d.coreMaxHp)}`);

  if (d.godMode) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('GOD MODE', 16, screenH - 100);
  }

  // Weapon / ammo (bottom-right area)
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(d.weaponLabel, screenW - 16, screenH - 70);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#cfd8e3';
  ctx.fillText(d.ammoText, screenW - 16, screenH - 50);

  // Summon cooldown
  const summonPct = d.summonCooldownTotal > 0 ? 1 - d.summonCooldownRemaining / d.summonCooldownTotal : 1;
  ctx.textAlign = 'left';
  drawBar(
    ctx,
    screenW - 220 - 16,
    screenH - 30,
    220,
    18,
    summonPct,
    d.summonCooldownRemaining <= 0 ? '#c39bd3' : '#5a4a63',
    d.summonCooldownRemaining <= 0
      ? `Summon ready (${d.summonAliveCount}/${d.summonMaxAlive})`
      : `Summon ${d.summonCooldownRemaining.toFixed(1)}s (${d.summonAliveCount}/${d.summonMaxAlive})`,
  );

  // Coins + wave (top area)
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText(`Coins: ${d.coins}`, 16, 16);

  ctx.fillStyle = '#fff';
  ctx.fillText(`Wave ${d.waveNumber}/${d.totalWaves}`, 16, 40);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#cfd8e3';
  ctx.fillText(`Enemies alive: ${d.enemiesAlive}`, 16, 62);

  // Wave/intermission timer, centered top
  ctx.textAlign = 'center';
  if (d.wavePhase === 'running') {
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(fmtTime(d.timeRemaining), screenW / 2, 16);
  } else if (d.wavePhase === 'intermission') {
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffd766';
    ctx.fillText(`Next wave in ${fmtTime(d.timeRemaining)}`, screenW / 2, 16);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(`Space to call early — bonus +${Math.round(d.earlyCallBonusPreview * 100)}%`, screenW / 2, 40);
  }
  ctx.textAlign = 'left';

  // Boss bar
  if (d.bossAlive) {
    const bw = 500;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#ff8080';
    ctx.fillText('BOSS', screenW / 2, 60);
    ctx.textAlign = 'left';
    drawBar(ctx, screenW / 2 - bw / 2, 74, bw, 18, d.bossHp / d.bossMaxHp, '#8b0000', `${Math.ceil(d.bossHp)}/${d.bossMaxHp}`);
  }

  // Shop prompt
  if (d.shopPromptVisible) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Press E to open shop', screenW / 2, screenH - 120);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}
