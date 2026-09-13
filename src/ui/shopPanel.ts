import { SHOP_ITEMS } from '../config.ts';
import { describeItem } from '../economy/describe.ts';
import { nextPrice, type ShopItemId, type ShopLevels } from '../economy/shop.ts';
import { playSfx } from '../audio/sfx.ts';

// Round 9: reworked from round 7's fixed 860x760 panel, which no longer fit
// on modest viewports (760 tall alone exceeds a 720px-tall window before any
// margin) — see DECISIONS.md. The panel is now sized dynamically off the
// actual viewport plus the current tab's real row count, with a scrollable
// row list as a genuine fallback for whatever combination of viewport size /
// row count still doesn't fit (there are only 8 rows on the fullest tab
// today, comfortably within the compact sizing below even at 1024x768/
// 1280x720, but a future tab addition won't silently clip again).
const PANEL_W = 720;
const PANEL_SIDE_MARGIN = 20; // min gap kept between panel and screen edge
const PANEL_PAD = 18; // inner padding top/bottom before header/after footer
const HEADER_H = 46; // title + coins row
const TAB_H = 40;
const TAB_GAP = 14; // between tabs row and row list
const TAB_W = 200;
const ROW_H = 42;
const ROW_GAP = 3;
const FOOTER_H = 30;
const PRESS_FLASH_DURATION = 0.12; // seconds a clicked row briefly flashes/scales down

export type ShopTab = 'weapons' | 'base';

type HoverTarget = { kind: 'tab'; tab: ShopTab } | { kind: 'row'; id: ShopItemId } | null;

function targetsEqual(a: HoverTarget, b: HoverTarget): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === 'tab' && b.kind === 'tab' ? a.tab === b.tab : a.kind === 'row' && b.kind === 'row' ? a.id === b.id : false;
}

interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
  tabY: number;
  listTop: number; // top of the (possibly-clipped) row list, in screen space
  listH: number; // available height for the row list before scrolling kicks in
  contentH: number; // full unscrolled height of every row stacked
  scrollable: boolean;
  maxScroll: number;
}

export class ShopPanel {
  activeTab: ShopTab = 'weapons';
  private hover: HoverTarget = null;
  private pressedRow: ShopItemId | null = null;
  private pressFlashTimer = 0;
  private scrollOffset: Record<ShopTab, number> = { weapons: 0, base: 0 };

  private layout(screenW: number, screenH: number): Layout {
    const w = Math.min(PANEL_W, screenW - PANEL_SIDE_MARGIN * 2);
    const rowCount = this.rowsForTab(this.activeTab).length;
    const contentH = rowCount * ROW_H;
    const desiredH = PANEL_PAD * 2 + HEADER_H + TAB_H + TAB_GAP + contentH + FOOTER_H;
    const maxH = screenH - PANEL_SIDE_MARGIN * 2;
    const h = Math.min(desiredH, maxH);
    const x = screenW / 2 - w / 2;
    const y = screenH / 2 - h / 2;
    const tabY = y + PANEL_PAD + HEADER_H;
    const listTop = tabY + TAB_H + TAB_GAP;
    const listH = h - PANEL_PAD - HEADER_H - TAB_H - TAB_GAP - FOOTER_H;
    const scrollable = contentH > listH + 0.5;
    const maxScroll = Math.max(0, contentH - listH);
    return { x, y, w, h, tabY, listTop, listH, contentH, scrollable, maxScroll };
  }

  private rowsForTab(tab: ShopTab): ShopItemId[] {
    return SHOP_ITEMS.filter((i) => i.tab === tab).map((i) => i.id as ShopItemId);
  }

  private clampScroll(): void {
    const tab = this.activeTab;
    const off = this.scrollOffset[tab];
    // Recomputed lazily from the last-known layout via handleWheel/hitTest's
    // own layout() call — kept simple by just floor-clamping at 0 here and
    // letting the real max-scroll clamp happen where layout() is available.
    if (off < 0) this.scrollOffset[tab] = 0;
  }

  /** Call when the shop is open and the mouse wheel moves, to scroll the row list (only does anything once it's genuinely scrollable). */
  handleWheel(deltaY: number, screenW: number, screenH: number): void {
    const layout = this.layout(screenW, screenH);
    if (!layout.scrollable) return;
    const tab = this.activeTab;
    this.scrollOffset[tab] = Math.max(0, Math.min(layout.maxScroll, this.scrollOffset[tab] + deltaY));
  }

  /** Hit-tests (mx,my) against tabs/rows, returning what's under the cursor without side effects. */
  private hitTest(mx: number, my: number, screenW: number, screenH: number): HoverTarget {
    const layout = this.layout(screenW, screenH);
    const { x, y, w, h, tabY } = layout;
    if (mx < x || mx > x + w || my < y || my > y + h) return null;

    if (my >= tabY && my <= tabY + TAB_H) {
      if (mx >= x + 16 && mx <= x + 16 + TAB_W) return { kind: 'tab', tab: 'weapons' };
      if (mx >= x + 16 + TAB_W + 16 && mx <= x + 16 + TAB_W + 16 + TAB_W) return { kind: 'tab', tab: 'base' };
      return null;
    }

    // Rows are clipped to [listTop, listTop+listH); anything outside that
    // band (including the footer text below it) isn't a row hit even though
    // it's still inside the panel rect.
    if (my < layout.listTop || my > layout.listTop + layout.listH) return null;

    const rows = this.rowsForTab(this.activeTab);
    const scroll = this.scrollOffset[this.activeTab];
    const localY = my - layout.listTop + scroll;
    const idx = Math.floor(localY / ROW_H);
    if (idx < 0 || idx >= rows.length) return null;
    const withinRow = localY - idx * ROW_H;
    if (withinRow > ROW_H - ROW_GAP) return null; // in the small gap between rows
    return { kind: 'row', id: rows[idx] };
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
      this.clampScroll();
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

    const layout = this.layout(screenW, screenH);
    const { x, y, w, h, tabY, listTop, listH, contentH, scrollable } = layout;
    ctx.fillStyle = '#1e2430';
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 26px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Shop', x + 20, y + PANEL_PAD);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText(`Coins: ${coins}`, x + w - 20, y + PANEL_PAD + 6);
    ctx.textAlign = 'left';

    const weaponsHovered = this.hover?.kind === 'tab' && this.hover.tab === 'weapons';
    const baseHovered = this.hover?.kind === 'tab' && this.hover.tab === 'base';
    this.drawTab(ctx, x + 16, tabY, TAB_W, TAB_H, 'Weapons', this.activeTab === 'weapons', weaponsHovered);
    this.drawTab(ctx, x + 16 + TAB_W + 16, tabY, TAB_W, TAB_H, 'Base', this.activeTab === 'base', baseHovered);

    const rows = this.rowsForTab(this.activeTab);
    const scroll = Math.max(0, Math.min(layout.maxScroll, this.scrollOffset[this.activeTab]));
    this.scrollOffset[this.activeTab] = scroll;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listTop, w, listH);
    ctx.clip();

    for (let i = 0; i < rows.length; i++) {
      const id = rows[i];
      const rowY = listTop - scroll + i * ROW_H;
      if (rowY + ROW_H < listTop || rowY > listTop + listH) continue; // cheap off-screen skip

      const def = SHOP_ITEMS.find((d) => d.id === id)!;
      const level = levels[id];
      const cost = nextPrice(id, levels);
      const affordable = coins >= cost;
      const hovered = this.hover?.kind === 'row' && this.hover.id === id;
      const pressed = this.pressedRow === id && this.pressFlashTimer > 0;
      // Brief scale-down/brighten flash on the just-clicked row.
      const pressT = pressed ? this.pressFlashTimer / PRESS_FLASH_DURATION : 0;
      const scale = 1 - pressT * 0.03;

      ctx.save();
      if (pressed) {
        const cx = x + w / 2;
        const cy = rowY + (ROW_H - ROW_GAP) / 2;
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
      ctx.fillRect(x + 12, rowY, w - 24, ROW_H - ROW_GAP);
      if (hovered || pressed) {
        ctx.strokeStyle = pressed ? '#ffffff' : '#9fd3ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 12.75, rowY + 0.75, w - 25.5, ROW_H - ROW_GAP - 1.5);
      }

      ctx.font = '17px sans-serif';
      ctx.fillStyle = affordable ? '#f0f0f0' : '#6b7280';
      ctx.fillText(`${def.label}  (Lv ${level})`, x + 20, rowY + 11);

      const { current, next } = describeItem(id, levels);
      ctx.fillStyle = affordable ? '#9fd3ff' : '#5a6472';
      ctx.font = '14px sans-serif';
      ctx.fillText(`${current} -> ${next}`, x + 20, rowY + 27);

      ctx.font = '17px sans-serif';
      ctx.fillStyle = affordable ? '#ffd700' : '#6b7280';
      ctx.textAlign = 'right';
      ctx.fillText(`${cost}c`, x + w - 20, rowY + 15);
      ctx.textAlign = 'left';
      ctx.restore();
    }
    ctx.restore(); // undo clip

    if (scrollable) {
      // Minimal scrollbar track/thumb along the list's right edge — the
      // list is always short enough to fit without scrolling for today's
      // row counts (see the header comment), so this path is a fallback,
      // not the primary fix.
      const trackX = x + w - 8;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(trackX, listTop, 4, listH);
      const thumbH = Math.max(20, (listH / contentH) * listH);
      const thumbY = listTop + (scroll / layout.maxScroll) * (listH - thumbH);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(trackX, thumbY, 4, thumbH);
    }

    ctx.fillStyle = '#9aa4b2';
    ctx.font = '15px sans-serif';
    ctx.fillText(
      scrollable ? 'Click a row to buy. Scroll for more. Press E to close.' : 'Click a row to buy. Press E to close.',
      x + 20,
      y + h - FOOTER_H + 6,
    );
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
    ctx.font = '19px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
}
