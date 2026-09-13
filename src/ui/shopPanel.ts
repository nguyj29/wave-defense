import { SHOP_ITEMS } from '../config.ts';
import { describeItem } from '../economy/describe.ts';
import { nextPrice, type ShopItemId, type ShopLevels } from '../economy/shop.ts';

const PANEL_W = 560;
const PANEL_H = 520;
const ROW_H = 40;
const TAB_H = 36;

export type ShopTab = 'weapons' | 'base';

export class ShopPanel {
  activeTab: ShopTab = 'weapons';

  private layout(screenW: number, screenH: number) {
    const x = screenW / 2 - PANEL_W / 2;
    const y = screenH / 2 - PANEL_H / 2;
    return { x, y, w: PANEL_W, h: PANEL_H };
  }

  private rowsForTab(tab: ShopTab): ShopItemId[] {
    return SHOP_ITEMS.filter((i) => i.tab === tab).map((i) => i.id as ShopItemId);
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
    const { x, y, w } = this.layout(screenW, screenH);
    if (mx < x || mx > x + w || my < y || my > y + PANEL_H) return true; // click inside overlay dims the world; swallow it anyway

    // Tabs
    const tabY = y + 44;
    if (my >= tabY && my <= tabY + TAB_H) {
      if (mx >= x + 20 && mx <= x + 20 + 150) {
        this.activeTab = 'weapons';
        return true;
      }
      if (mx >= x + 180 && mx <= x + 180 + 150) {
        this.activeTab = 'base';
        return true;
      }
    }

    const rows = this.rowsForTab(this.activeTab);
    const listTop = tabY + TAB_H + 12;
    for (let i = 0; i < rows.length; i++) {
      const rowY = listTop + i * ROW_H;
      if (my >= rowY && my <= rowY + ROW_H - 4) {
        const id = rows[i];
        const cost = nextPrice(id, levels);
        if (coins >= cost) onBuy(id, cost);
        return true;
      }
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
    this.drawTab(ctx, x + 20, tabY, 150, TAB_H, 'Weapons', this.activeTab === 'weapons');
    this.drawTab(ctx, x + 180, tabY, 150, TAB_H, 'Base', this.activeTab === 'base');

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

      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.0)';
      ctx.fillRect(x + 16, rowY, w - 32, ROW_H - 4);

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
    }

    ctx.fillStyle = '#9aa4b2';
    ctx.font = '12px sans-serif';
    ctx.fillText('Click a row to buy. Press E to close.', x + 20, y + h - 22);
    ctx.restore();
  }

  private drawTab(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, active: boolean): void {
    ctx.fillStyle = active ? '#3a4a63' : '#262c38';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#4a5568';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = active ? '#ffffff' : '#9aa4b2';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 - 7);
    ctx.textAlign = 'left';
  }
}
