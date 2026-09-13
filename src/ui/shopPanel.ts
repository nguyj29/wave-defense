import { SHOP_ITEMS } from '../config.ts';
import { describeItem } from '../economy/describe.ts';
import { nextPrice, type ShopItemId, type ShopLevels } from '../economy/shop.ts';
import { playSfx } from '../audio/sfx.ts';

const PANEL_W = 560;
const PANEL_H = 520;
const ROW_H = 40;
const TAB_H = 36;
const PRESS_FLASH_DURATION = 0.12; // seconds a clicked row briefly flashes/scales down

export type ShopTab = 'weapons' | 'base';

type HoverTarget = { kind: 'tab'; tab: ShopTab } | { kind: 'row'; id: ShopItemId } | null;

function targetsEqual(a: HoverTarget, b: HoverTarget): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === 'tab' && b.kind === 'tab' ? a.tab === b.tab : a.kind === 'row' && b.kind === 'row' ? a.id === b.id : false;
}

export class ShopPanel {
  activeTab: ShopTab = 'weapons';
  private hover: HoverTarget = null;
  private pressedRow: ShopItemId | null = null;
  private pressFlashTimer = 0;

  private layout(screenW: number, screenH: number) {
    const x = screenW / 2 - PANEL_W / 2;
    const y = screenH / 2 - PANEL_H / 2;
    return { x, y, w: PANEL_W, h: PANEL_H };
  }

  private rowsForTab(tab: ShopTab): ShopItemId[] {
    return SHOP_ITEMS.filter((i) => i.tab === tab).map((i) => i.id as ShopItemId);
  }

  /** Hit-tests (mx,my) against tabs/rows, returning what's under the cursor without side effects. */
  private hitTest(mx: number, my: number, screenW: number, screenH: number): HoverTarget {
    const { x, y, w } = this.layout(screenW, screenH);
    if (mx < x || mx > x + w || my < y || my > y + PANEL_H) return null;

    const tabY = y + 44;
    if (my >= tabY && my <= tabY + TAB_H) {
      if (mx >= x + 20 && mx <= x + 20 + 150) return { kind: 'tab', tab: 'weapons' };
      if (mx >= x + 180 && mx <= x + 180 + 150) return { kind: 'tab', tab: 'base' };
      return null;
    }

    const rows = this.rowsForTab(this.activeTab);
    const listTop = tabY + TAB_H + 12;
    for (let i = 0; i < rows.length; i++) {
      const rowY = listTop + i * ROW_H;
      if (my >= rowY && my <= rowY + ROW_H - 4) return { kind: 'row', id: rows[i] };
    }
    return null;
  }

  /** Call every frame the shop is open (e.g. from render()) to keep hover highlight/SFX current. */
  updateHover(mx: number, my: number, screenW: number, screenH: number): void {
    const next = this.hitTest(mx, my, screenW, screenH);
    if (!targetsEqual(next, this.hover) && next !== null) playSfx('uiHover', 0.5);
    this.hover = next;
  }

  /** Call every fixed tick the shop is open so the press-flash animation decays even without new clicks. */
  tickPressFlash(dt: number): void {
    if (this.pressFlashTimer > 0) {
      this.pressFlashTimer -= dt;
      if (this.pressFlashTimer <= 0) this.pressedRow = null;
    }
  }

  /** Returns true if the click was consumed by the panel. */
  handleClick(
    mx: number,
    my: number,
    screenW: number,
    screenH: number,
    coins: number,
    levels: ShopLevels,
    onBuy: (id: ShopItemId, cost: number) => void,
  ): boolean {
    const target = this.hitTest(mx, my, screenW, screenH);
    if (target === null) return true; // click inside overlay dims the world; swallow it anyway

    if (target.kind === 'tab') {
      if (this.activeTab !== target.tab) playSfx('uiClick', 0.6);
      this.activeTab = target.tab;
      return true;
    }

    const id = target.id;
    const cost = nextPrice(id, levels);
    if (coins >= cost) {
      onBuy(id, cost);
      this.pressedRow = id;
      this.pressFlashTimer = PRESS_FLASH_DURATION;
    } else {
      playSfx('uiClick', 0.3); // muted "can't afford" click, still confirms the click registered
    }
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, coins: number, levels: ShopLevels): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, screenW, screenH);

    const { x, y, w, h } = this.layout(screenW, screenH);
    ctx.fillStyle = '#1e2430';
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 20px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Shop', x + 20, y + 12);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`Coins: ${coins}`, x + w - 140, y + 16);

    const tabY = y + 44;
    const weaponsHovered = this.hover?.kind === 'tab' && this.hover.tab === 'weapons';
    const baseHovered = this.hover?.kind === 'tab' && this.hover.tab === 'base';
    this.drawTab(ctx, x + 20, tabY, 150, TAB_H, 'Weapons', this.activeTab === 'weapons', weaponsHovered);
    this.drawTab(ctx, x + 180, tabY, 150, TAB_H, 'Base', this.activeTab === 'base', baseHovered);

    const rows = this.rowsForTab(this.activeTab);
    const listTop = tabY + TAB_H + 12;
    ctx.font = '13px sans-serif';
    for (let i = 0; i < rows.length; i++) {
      const id = rows[i];
      const def = SHOP_ITEMS.find((d) => d.id === id)!;
      const level = levels[id];
      const cost = nextPrice(id, levels);
      const affordable = coins >= cost;
      const rowY = listTop + i * ROW_H;
      const hovered = this.hover?.kind === 'row' && this.hover.id === id;
      const pressed = this.pressedRow === id && this.pressFlashTimer > 0;
      // Brief scale-down/brighten flash on the just-clicked row.
      const pressT = pressed ? this.pressFlashTimer / PRESS_FLASH_DURATION : 0;
      const scale = 1 - pressT * 0.03;

      ctx.save();
      if (pressed) {
        const cx = x + w / 2;
        const cy = rowY + (ROW_H - 4) / 2;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
      }

      ctx.fillStyle = pressed
        ? 'rgba(255,255,255,0.22)'
        : hovered
          ? 'rgba(159,211,255,0.14)'
          : i % 2 === 0
            ? 'rgba(255,255,255,0.03)'
            : 'rgba(255,255,255,0.0)';
      ctx.fillRect(x + 16, rowY, w - 32, ROW_H - 4);
      if (hovered || pressed) {
        ctx.strokeStyle = pressed ? '#ffffff' : '#9fd3ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 16.75, rowY + 0.75, w - 33.5, ROW_H - 5.5);
      }

      ctx.fillStyle = affordable ? '#f0f0f0' : '#6b7280';
      ctx.fillText(`${def.label}  (Lv ${level})`, x + 24, rowY + 12);

      const { current, next } = describeItem(id, levels);
      ctx.fillStyle = affordable ? '#9fd3ff' : '#5a6472';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${current} -> ${next}`, x + 260, rowY + 13);
      ctx.font = '13px sans-serif';

      ctx.fillStyle = affordable ? '#ffd700' : '#6b7280';
      ctx.textAlign = 'right';
      ctx.fillText(`${cost}c`, x + w - 24, rowY + 12);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    ctx.fillStyle = '#9aa4b2';
    ctx.font = '12px sans-serif';
    ctx.fillText('Click a row to buy. Press E to close.', x + 20, y + h - 22);
    ctx.restore();
  }

  private drawTab(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, active: boolean, hovered: boolean): void {
    ctx.fillStyle = active ? '#3a4a63' : hovered ? '#31394a' : '#262c38';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = hovered ? '#9fd3ff' : '#4a5568';
    ctx.lineWidth = hovered ? 1.5 : 1;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 1;
    ctx.fillStyle = active ? '#ffffff' : '#9aa4b2';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 - 7);
    ctx.textAlign = 'left';
  }
}
