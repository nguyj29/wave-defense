// startScreen.ts — the difficulty-select start screen (round 6). Kept as its
// own tiny UI module (matching hud.ts/minimap.ts/shopPanel.ts's pattern of
// one file per screen/HUD element) rather than folded into game.ts.
//
// Layout is computed by two small helper functions shared between drawing
// and hit-testing, so a click always lands on exactly what was drawn.

import { DIFFICULTY, type DifficultyId } from '../config.ts';

const ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'veryHard', 'hell'];
export const DIFFICULTY_ORDER = ORDER;

// Round 7: enlarged alongside the 2x UI text (see DECISIONS.md) — buttons
// widened so the doubled difficulty labels (bold 15px -> bold 30px, e.g.
// "Very Hard") still fit comfortably inside.
const BUTTON_W = 210;
const BUTTON_H = 84;
const GAP = 18;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function difficultyButtons(screenW: number, screenH: number): { id: DifficultyId; rect: Rect }[] {
  const totalW = ORDER.length * BUTTON_W + (ORDER.length - 1) * GAP;
  const startX = screenW / 2 - totalW / 2;
  const y = screenH / 2 - BUTTON_H / 2;
  return ORDER.map((id, i) => ({ id, rect: { x: startX + i * (BUTTON_W + GAP), y, w: BUTTON_W, h: BUTTON_H } }));
}

function startButton(screenW: number, screenH: number): Rect {
  const w = 300;
  const h = 84;
  return { x: screenW / 2 - w / 2, y: screenH / 2 + 130, w, h };
}

function inRect(mx: number, my: number, r: Rect): boolean {
  return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
}

export type StartScreenHit = { type: 'difficulty'; id: DifficultyId } | { type: 'start' } | null;

export function hitTestStartScreen(mx: number, my: number, screenW: number, screenH: number): StartScreenHit {
  for (const b of difficultyButtons(screenW, screenH)) {
    if (inRect(mx, my, b.rect)) return { type: 'difficulty', id: b.id };
  }
  if (inRect(mx, my, startButton(screenW, screenH))) return { type: 'start' };
  return null;
}

export function drawStartScreen(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, selected: DifficultyId): void {
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,8,0.94)';
  ctx.fillRect(0, 0, screenW, screenH);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 88px sans-serif';
  ctx.fillText('WAVE DEFENSE', screenW / 2, screenH / 2 - 220);

  ctx.font = '34px sans-serif';
  ctx.fillStyle = '#cfd8e3';
  ctx.fillText('Select difficulty', screenW / 2, screenH / 2 - 140);

  for (const b of difficultyButtons(screenW, screenH)) {
    const def = DIFFICULTY[b.id];
    const isSelected = b.id === selected;
    const { x, y, w, h } = b.rect;

    ctx.fillStyle = def.color;
    ctx.fillRect(x, y, w, h);

    // Always draw a thin light border — necessary so Hell's near-black
    // swatch doesn't visually disappear against the equally-dark backdrop —
    // then a thicker white one on top when selected.
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }

    ctx.fillStyle = def.textColor;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(def.label, x + w / 2, y + h / 2 + 10);
  }

  const sb = startButton(screenW, screenH);
  ctx.fillStyle = '#3b6fe0';
  ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(sb.x, sb.y, sb.w, sb.h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('START', sb.x + sb.w / 2, sb.y + sb.h / 2 + 16);

  ctx.font = '26px sans-serif';
  ctx.fillStyle = '#9fb0c0';
  ctx.fillText('Click a difficulty, or use number keys 1-5 / arrow keys — Enter or click START to begin', screenW / 2, sb.y + sb.h + 50);

  ctx.restore();
}
