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
  // Round 8: true once past the 5 static WAVES entries (endless mode) — HUD
  // drops the "/5" suffix and shows an "Endless" tag instead once true.
  isEndless: boolean;
  enemiesAlive: number;
  wavePhase: 'running' | 'intermission' | 'allWavesComplete';
  timeRemaining: number;
  earlyCallBonusPreview: number;
  bossAlive: boolean;
  bossHp: number;
  bossMaxHp: number;
  shopPromptVisible: boolean;
  godMode: boolean;
  musicMuted: boolean;
  // Inventory slot bar (bottom-right, see drawInventorySlots): which of the
  // 3 equippable slots is active, plus enough per-slot state to draw a
  // small progress sliver (rifle reload, wand cooldown sweep).
  activeSlot: 1 | 2 | 3;
  rifleReloadPct: number; // 0..1, 1 = fully loaded/no reload in progress
  wandCooldownPct: number; // 0..1, 1 = ready
  // Current difficulty (round 6), small/unobtrusive HUD readout.
  difficultyLabel: string;
  difficultyColor: string;
  // Round 6: once spawning has stopped for this wave (timer elapsed) but
  // enemies remain, the timer display switches from a countdown to this.
  spawningStopped: boolean;
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
  ctx.font = '24px sans-serif'; // 2x (round 7): all UI text doubled, see DECISIONS.md
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 10, y + h / 2);
}

// One entry per equippable slot, in display order — shape-based icon plus
// label, matching the existing HUD's flat-color/bordered-box visual
// language (see drawBar above) rather than introducing real art assets.
const SLOTS: { slot: 1 | 2 | 3; label: string; color: string }[] = [
  { slot: 1, label: '1', color: '#5ec9c0' }, // rifle
  { slot: 2, label: '2', color: '#c3a15e' }, // pistol
  { slot: 3, label: '3', color: '#c39bd3' }, // summon wand
];

/** 3-slot weapon/wand inventory bar, bottom-right, with the active slot outlined and a small per-slot readiness sliver. */
function drawInventorySlots(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, d: HudData): void {
  // Bumped from 44 (round 7) so the doubled slot-number label (11px -> 22px)
  // has room to sit inside the box without crowding the icon.
  const size = 52;
  const gap = 8;
  const totalW = SLOTS.length * size + (SLOTS.length - 1) * gap;
  const startX = screenW - 16 - totalW;
  const y = screenH - 76 - size - 40; // stacked above the ammo/summon-cooldown row (see layout note in drawHud)

  for (let i = 0; i < SLOTS.length; i++) {
    const s = SLOTS[i];
    const x = startX + i * (size + gap);
    const active = d.activeSlot === s.slot;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, size, size);

    // Icon: a simple shape per slot so it's readable without text —
    // rifle: horizontal bar, pistol: small block, wand: diamond.
    ctx.fillStyle = s.color;
    const cx = x + size / 2;
    const cy = y + size / 2;
    if (s.slot === 1) {
      ctx.fillRect(x + 8, cy - 4, size - 16, 8);
    } else if (s.slot === 2) {
      ctx.fillRect(cx - 8, cy - 10, 16, 20);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 14);
      ctx.lineTo(cx + 12, cy);
      ctx.lineTo(cx, cy + 14);
      ctx.lineTo(cx - 12, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Readiness sliver along the bottom edge: rifle reload progress, wand
    // cooldown sweep. Pistol has no cooldown to show (infinite ammo).
    const pct = s.slot === 1 ? d.rifleReloadPct : s.slot === 3 ? d.wandCooldownPct : 1;
    if (pct < 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y + size - 4, size, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y + size - 4, size * Math.max(0, Math.min(1, pct)), 4);
    }

    ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = active ? 3 : 1;
    ctx.strokeRect(x, y, size, size);

    ctx.fillStyle = active ? '#ffffff' : 'rgba(255,255,255,0.7)';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s.label, x + 5, y + 22);
  }
}

export function drawHud(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, d: HudData): void {
  ctx.save();

  drawInventorySlots(ctx, screenW, screenH, d);

  // Music mute indicator, small and out of the way (top-right).
  ctx.textAlign = 'right';
  ctx.font = '24px sans-serif';
  ctx.fillStyle = d.musicMuted ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.8)';
  ctx.fillText(d.musicMuted ? '♪ off (M)' : '♪ on (M)', screenW - 16, 24);

  // Current difficulty, small and unobtrusive, just below the music toggle.
  // A colored swatch (with a thin light border, since Hell's color is
  // near-black and would otherwise vanish against the canvas) plus a plain
  // white label reads clearly regardless of which difficulty color is active.
  {
    const swatchSize = 18;
    const swatchX = screenW - 16 - swatchSize;
    const swatchY = 56 - swatchSize / 2;
    ctx.fillStyle = d.difficultyColor;
    ctx.fillRect(swatchX, swatchY, swatchSize, swatchSize);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(swatchX, swatchY, swatchSize, swatchSize);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(d.difficultyLabel, swatchX - 10, 56);
  }

  // Player HP (bottom-left)
  drawBar(ctx, 16, screenH - 84, 320, 34, d.playerHp / d.playerMaxHp, '#5ec96a', `HP ${Math.ceil(d.playerHp)}/${d.playerMaxHp}`);
  // Core HP (bottom-left, above player)
  drawBar(ctx, 16, screenH - 132, 320, 34, d.coreHp / d.coreMaxHp, '#4ea3d1', `Core ${Math.ceil(d.coreHp)}/${Math.round(d.coreMaxHp)}`);

  if (d.godMode) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('GOD MODE', 16, screenH - 148);
  }

  // Weapon / ammo (bottom-right area, above the inventory slot bar)
  ctx.textAlign = 'right';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(d.weaponLabel, screenW - 16, screenH - 106);
  ctx.font = '26px sans-serif';
  ctx.fillStyle = '#cfd8e3';
  ctx.fillText(d.ammoText, screenW - 16, screenH - 76);

  // Summon cooldown
  const summonPct = d.summonCooldownTotal > 0 ? 1 - d.summonCooldownRemaining / d.summonCooldownTotal : 1;
  ctx.textAlign = 'left';
  drawBar(
    ctx,
    screenW - 320 - 16,
    screenH - 46,
    320,
    30,
    summonPct,
    d.summonCooldownRemaining <= 0 ? '#c39bd3' : '#5a4a63',
    d.summonCooldownRemaining <= 0
      ? `Summon ready (${d.summonAliveCount}/${d.summonMaxAlive})`
      : `Summon ${d.summonCooldownRemaining.toFixed(1)}s (${d.summonAliveCount}/${d.summonMaxAlive})`,
  );

  // Coins + wave (top area)
  ctx.textAlign = 'left';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText(`Coins: ${d.coins}`, 16, 28);

  ctx.fillStyle = '#fff';
  ctx.fillText(d.isEndless ? `Wave ${d.waveNumber} (Endless)` : `Wave ${d.waveNumber}/5`, 16, 76);
  ctx.font = '26px sans-serif';
  ctx.fillStyle = '#cfd8e3';
  ctx.fillText(`Enemies alive: ${d.enemiesAlive}`, 16, 118);

  // Wave/intermission timer, centered top. Round 6: the running-phase timer
  // now only governs spawning, not the wave's end — once it hits 0 the label
  // switches from a countdown to a "clearing remaining enemies" indicator
  // rather than implying the wave itself ends at 0 (it doesn't until the
  // last enemy is dead).
  ctx.textAlign = 'center';
  if (d.wavePhase === 'running') {
    ctx.font = 'bold 40px sans-serif';
    if (!d.spawningStopped) {
      ctx.fillStyle = '#fff';
      ctx.fillText(`Spawning ends in: ${fmtTime(d.timeRemaining)}`, screenW / 2, 28);
    } else if (d.enemiesAlive > 0) {
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 200);
      ctx.fillStyle = `rgba(255,214,102,${pulse})`;
      ctx.fillText('Clearing remaining enemies...', screenW / 2, 28);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillText('Wave clear!', screenW / 2, 28);
    }
  } else if (d.wavePhase === 'intermission') {
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = '#ffd766';
    ctx.fillText(`Next wave in ${fmtTime(d.timeRemaining)}`, screenW / 2, 28);
    ctx.font = '26px sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(`Space to call early — bonus +${Math.round(d.earlyCallBonusPreview * 100)}%`, screenW / 2, 74);
  }
  ctx.textAlign = 'left';

  // Boss bar
  if (d.bossAlive) {
    const bw = 700;
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#ff8080';
    ctx.fillText('BOSS', screenW / 2, 130);
    ctx.textAlign = 'left';
    drawBar(ctx, screenW / 2 - bw / 2, 148, bw, 30, d.bossHp / d.bossMaxHp, '#8b0000', `${Math.ceil(d.bossHp)}/${d.bossMaxHp}`);
  }

  // Shop prompt
  if (d.shopPromptVisible) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Press E to open shop', screenW / 2, screenH - 200);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}
