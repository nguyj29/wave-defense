import { SHOP_ITEMS } from '../config.ts';
import { describeItem } from '../economy/describe.ts';
import { isMaxed, nextPrice, type ShopItemId, type ShopLevels } from '../economy/shop.ts';
import { playSfx } from '../audio/sfx.ts';

// Round 7: enlarged alongside the 2x UI text (see DECISIONS.md) — panel
// width/row height/tab height all grown enough that the doubled fonts below
// have room without overlapping or clipping.
const PANEL_W = 860;
const PANEL_H = 760;
const ROW_H = 62;
const TAB_H = 56;
// Phase 4: narrowed from 260 to fit 3 tabs (was 2: Weapons/Base) across the
// same PANEL_W without growing the panel itself.
const TAB_W = 190;
const TAB_GAP = 16;
const PRESS_FLASH_DURATION = 0.12; // seconds a clicked row briefly flashes/scales down

export type ShopTab = 'weapons' | 'base' | 'class';
const TABS: { id: ShopTab; label: string }[] = [
  { id: 'weapons', label: 'Weapons' },
  { id: 'base', label: 'Base' },
  { id: 'class', label: 'Class' },
];

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

    const tabY = y + 76;
    if (my >= tabY && my <= tabY + TAB_H) {
      for (let i = 0; i < TABS.length; i++) {
        const tx = x + 24 + i * (TAB_W + TAB_GAP);
        if (mx >= tx && mx <= tx + TAB_W) return { kind: 'tab', tab: TABS[i].id };
      }
      return null;
    }

    const rows = this.rowsForTab(this.activeTab);
    const listTop = tabY + TAB_H + 18;
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
    if (isMaxed(id, levels)) {
      playSfx('uiClick', 0.3);
      return true;
    }
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
    ctx.font = 'bold 40px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Shop', x + 24, y + 20);
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText(`Coins: ${coins}`, x + w - 24, y + 28);
    ctx.textAlign = 'left';

    const tabY = y + 76;
    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i];
      const tx = x + 24 + i * (TAB_W + TAB_GAP);
      const hovered = this.hover?.kind === 'tab' && this.hover.tab === tab.id;
      this.drawTab(ctx, tx, tabY, TAB_W, TAB_H, tab.label, this.activeTab === tab.id, hovered);
    }

    const rows = this.rowsForTab(this.activeTab);
    const listTop = tabY + TAB_H + 18;
    ctx.font = '26px sans-serif';
    for (let i = 0; i < rows.length; i++) {
      const id = rows[i];
      const def = SHOP_ITEMS.find((d) => d.id === id)!;
      const level = levels[id];
      const maxed = isMaxed(id, levels);
      const cost = nextPrice(id, levels);
      const affordable = !maxed && coins >= cost;
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

      ctx.font = '26px sans-serif';
      ctx.fillStyle = affordable ? '#f0f0f0' : '#6b7280';
      ctx.fillText(maxed ? def.label : `${def.label}  (Lv ${level})`, x + 24, rowY + 16);

      const { current, next } = describeItem(id, levels);
      ctx.fillStyle = affordable ? '#9fd3ff' : '#5a6472';
      ctx.font = '22px sans-serif';
      ctx.fillText(maxed ? current : `${current} -> ${next}`, x + 460, rowY + 19);

      ctx.font = '26px sans-serif';
      ctx.fillStyle = maxed ? '#5ec96a' : affordable ? '#ffd700' : '#6b7280';
      ctx.textAlign = 'right';
      ctx.fillText(maxed ? 'OWNED' : `${cost}c`, x + w - 24, rowY + 16);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    ctx.fillStyle = '#9aa4b2';
    ctx.font = '22px sans-serif';
    ctx.fillText('Click a row to buy. Press E to close.', x + 24, y + h - 40);
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
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
}
