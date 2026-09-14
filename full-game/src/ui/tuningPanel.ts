import { TUNING_KNOBS, type TuningKnobId, type TuningOverride } from '../config.ts';

// Reuses the debug overlay's visual language (dark semi-transparent box,
// monospace font, 2x-scaled text — see ui/debugOverlay.ts) rather than the
// shop panel's sans-serif/rounded style, since this is a debug/dev tool, not
// player-facing UI. Row hit-testing/press-flash structure is otherwise
// modeled directly on ui/shopPanel.ts for consistency.
const PANEL_W = 720;
const ROW_H = 64;
const HEADER_H = 96;
const FOOTER_H = 84;
const SLIDER_X = 300; // offset from panel's left edge to where the slider track starts
const SLIDER_W = 340;

type HoverTarget = { kind: 'knob'; id: TuningKnobId } | { kind: 'reset' } | null;

export class TuningPanel {
  selectedIndex = 0; // index into TUNING_KNOBS; TUNING_KNOBS.length itself means "Reset" row
  private hover: HoverTarget = null;

  private layout(screenW: number, screenH: number) {
    const h = HEADER_H + TUNING_KNOBS.length * ROW_H + FOOTER_H;
    const x = screenW / 2 - PANEL_W / 2;
    const y = screenH / 2 - h / 2;
    return { x, y, w: PANEL_W, h };
  }

  private knobRowRect(index: number, screenW: number, screenH: number) {
    const { x, y } = this.layout(screenW, screenH);
    return { x, y: y + HEADER_H + index * ROW_H, w: PANEL_W, h: ROW_H - 6 };
  }

  private resetRowRect(screenW: number, screenH: number) {
    const { x, y, w, h } = this.layout(screenW, screenH);
    return { x: x + 40, y: y + h - FOOTER_H + 14, w: w - 80, h: 44 };
  }

  private hitTest(mx: number, my: number, screenW: number, screenH: number): HoverTarget {
    const { x, y, w, h } = this.layout(screenW, screenH);
    if (mx < x || mx > x + w || my < y || my > y + h) return null;
    for (let i = 0; i < TUNING_KNOBS.length; i++) {
      const r = this.knobRowRect(i, screenW, screenH);
      if (my >= r.y && my <= r.y + r.h) return { kind: 'knob', id: TUNING_KNOBS[i].id };
    }
    const rr = this.resetRowRect(screenW, screenH);
    if (mx >= rr.x && mx <= rr.x + rr.w && my >= rr.y && my <= rr.y + rr.h) return { kind: 'reset' };
    return null;
  }

  updateHover(mx: number, my: number, screenW: number, screenH: number): void {
    this.hover = this.hitTest(mx, my, screenW, screenH);
  }

  /** Moves the row selection by +1/-1 (wraps), used by mouse-wheel scroll while the panel is open. */
  moveSelection(dir: number): void {
    const count = TUNING_KNOBS.length + 1; // +1 for the Reset row
    this.selectedIndex = (this.selectedIndex + dir + count) % count;
  }

  /** True while the currently selected row is a real knob (not the trailing Reset row). */
  private selectedKnob(): TuningKnobId | null {
    return this.selectedIndex < TUNING_KNOBS.length ? TUNING_KNOBS[this.selectedIndex].id : null;
  }

  /** Left/Right-arrow (or +/-) adjustment of the selected knob by one step (bigger with `big`, e.g. Shift held). */
  adjustSelected(dir: number, big: boolean, override: TuningOverride, onChange: (id: TuningKnobId, value: number | null) => void): void {
    const id = this.selectedKnob();
    if (!id) return;
    const def = TUNING_KNOBS.find((k) => k.id === id)!;
    const current = override[id] ?? def.default;
    const stepMult = big ? 5 : 1;
    const next = Math.max(def.min, Math.min(def.max, current + dir * def.step * stepMult));
    this.commit(id, next, def.default, onChange);
  }

  /**
   * Click-and-drag-as-slider: called every tick the panel is open while the
   * mouse button is held (Input.mouseDown is a continuous state, not
   * edge-triggered) — recomputes which row is under the cursor and, if it's
   * a knob row, sets that knob's value directly from the cursor's X position
   * within the slider track. This doubles as "click to set" for a single
   * click, and as continuous dragging for a held drag, with no separate
   * drag-state machine needed.
   */
  handleDrag(mx: number, my: number, screenW: number, screenH: number, override: TuningOverride, onChange: (id: TuningKnobId, value: number | null) => void): void {
    const target = this.hitTest(mx, my, screenW, screenH);
    if (!target || target.kind !== 'knob') return;
    const idx = TUNING_KNOBS.findIndex((k) => k.id === target.id);
    this.selectedIndex = idx;
    const def = TUNING_KNOBS[idx];
    const { x } = this.layout(screenW, screenH);
    const trackX = x + SLIDER_X;
    const frac = Math.max(0, Math.min(1, (mx - trackX) / SLIDER_W));
    const value = def.min + frac * (def.max - def.min);
    // Snap to the knob's step so dragging doesn't produce noisy fractional values.
    const snapped = Math.round(value / def.step) * def.step;
    this.commit(def.id, snapped, def.default, onChange);
  }

  /** A single (non-drag) click on the Reset row — clears every knob for the current difficulty. */
  handleClick(mx: number, my: number, screenW: number, screenH: number, onReset: () => void): void {
    const target = this.hitTest(mx, my, screenW, screenH);
    if (target?.kind === 'reset') onReset();
  }

  /** Values within float epsilon of the knob's default are treated as "no override" (deleted), keeping the saved object clean. */
  private commit(id: TuningKnobId, value: number, def: number, onChange: (id: TuningKnobId, value: number | null) => void): void {
    onChange(id, Math.abs(value - def) < 1e-9 ? null : value);
  }

  draw(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, override: TuningOverride, difficultyLabel: string): void {
    const { x, y, w, h } = this.layout(screenW, screenH);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(124,252,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#7CFC00';
    ctx.font = '24px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Tuning Panel — ${difficultyLabel}`, x + 20, y + 16);
    ctx.font = '18px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('scroll: select row   left/right: adjust (shift = big step)   drag: slide   B: close', x + 20, y + 48);

    for (let i = 0; i < TUNING_KNOBS.length; i++) {
      const def = TUNING_KNOBS[i];
      const r = this.knobRowRect(i, screenW, screenH);
      const selected = this.selectedIndex === i;
      const hovered = this.hover?.kind === 'knob' && this.hover.id === def.id;
      const value = override[def.id] ?? def.default;
      const isOverridden = override[def.id] !== undefined;

      ctx.fillStyle = selected ? 'rgba(124,252,0,0.14)' : hovered ? 'rgba(255,255,255,0.06)' : i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0)';
      ctx.fillRect(r.x + 16, r.y, r.w - 32, r.h);
      if (selected) {
        ctx.strokeStyle = '#7CFC00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x + 16.75, r.y + 0.75, r.w - 33.5, r.h - 1.5);
      }

      ctx.font = '22px monospace';
      ctx.fillStyle = isOverridden ? '#ffd766' : '#e8e8e8';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.label, r.x + 28, r.y + r.h / 2);

      // Slider track + filled portion + handle.
      const trackX = r.x + SLIDER_X;
      const trackY = r.y + r.h / 2;
      const frac = (value - def.min) / (def.max - def.min);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(trackX, trackY);
      ctx.lineTo(trackX + SLIDER_W, trackY);
      ctx.stroke();
      ctx.strokeStyle = isOverridden ? '#ffd766' : '#7CFC00';
      ctx.beginPath();
      ctx.moveTo(trackX, trackY);
      ctx.lineTo(trackX + SLIDER_W * frac, trackY);
      ctx.stroke();
      ctx.fillStyle = isOverridden ? '#ffd766' : '#7CFC00';
      ctx.beginPath();
      ctx.arc(trackX + SLIDER_W * frac, trackY, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.textBaseline = 'top';
      ctx.font = '22px monospace';
      ctx.fillStyle = isOverridden ? '#ffd766' : '#e8e8e8';
      ctx.fillText(`${value.toFixed(2)}x`, trackX + SLIDER_W + 20, r.y + r.h / 2 - 11);
    }

    // Reset row.
    const rr = this.resetRowRect(screenW, screenH);
    const resetSelected = this.selectedIndex === TUNING_KNOBS.length;
    const resetHovered = this.hover?.kind === 'reset';
    ctx.fillStyle = resetSelected ? 'rgba(255,120,120,0.18)' : resetHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
    ctx.strokeStyle = resetSelected || resetHovered ? '#ff8080' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
    ctx.font = '22px monospace';
    ctx.fillStyle = '#ff8080';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Reset ${difficultyLabel} to Defaults (click, or select + Enter)`, rr.x + rr.w / 2, rr.y + rr.h / 2);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '18px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Shift+B: export this difficulty\'s tuning to console + clipboard', x + 20, y + h - FOOTER_H + 66);
    ctx.restore();
  }
}
