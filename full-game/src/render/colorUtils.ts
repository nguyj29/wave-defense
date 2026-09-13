// ============================================================================
// colorUtils.ts — small hex<->HSL color math used to "warm" an enemy's base
// archetype color proportionally to how buffed it is (difficulty + endless
// wave scaling). See DECISIONS.md for the exact formula/reasoning.
// ============================================================================

interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

/** Parses a '#rrggbb' (or '#rgb') hex string into 0..255 r/g/b. Falls back to gray on anything unrecognized. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(num)) return { r: 128, g: 128, b: 128 };
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      default:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }
  return { h, s, l };
}

function hslToRgb(hsl: Hsl): { r: number; g: number; b: number } {
  const { s, l } = hsl;
  const h = ((hsl.h % 360) + 360) % 360;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

/**
 * Shifts a base hex color's hue toward red (hue 0deg), the short way around
 * the wheel, by `amount` (0..1: 0 = untouched, 1 = fully at hue 0), and
 * optionally boosts saturation a little for a more vivid "enraged" look at
 * high warmth. See DECISIONS.md for how `amount` ("warmth") is computed from
 * combined difficulty/endless-wave power level.
 */
export function warmHexColor(hex: string, amount: number): string {
  const clamped = Math.max(0, Math.min(1, amount));
  if (clamped <= 0) return hex;
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  // Move hue toward 0 the short way: violet/indigo sit at ~270-280deg, which
  // is closer to 360(=0) than to 0 going downward, so the short way is
  // "upward" through 360 then wrapping to 0, not decreasing straight to 0.
  // Compute the signed shortest angular distance from hsl.h to 0 (i.e. 360)
  // and move a fraction of the way along it.
  let delta = (0 - hsl.h + 540) % 360 - 180; // shortest signed distance in (-180, 180]
  const newHue = ((hsl.h + delta * clamped) % 360 + 360) % 360;
  // Modest saturation boost at high warmth (up to +15%), lightness untouched.
  const newSat = Math.min(1, hsl.s + 0.15 * clamped);
  const rgb = hslToRgb({ h: newHue, s: newSat, l: hsl.l });
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// ============================================================================
// Generation hue system (full-game Phase 1) — the generation ladder's ONLY
// visual signal is hue, walking the rainbow violet (g=0, weakest) -> red
// (g=6, endgame): 270deg down to 0deg, linearly in g. Archetype silhouette
// (shape) carries "what it is"; this hue carries "how strong." Deliberately
// implemented as pure HSL math on a base hex color rather than 7 hardcoded
// hex constants per archetype, so this is a clean drop-in replacement point
// for real per-generation sprite tinting later (Phase 5): swap
// `applyGenerationHue` for a canvas/WebGL tint-multiply of a grayscale sprite
// and every call site (factory/game.ts) stays the same. See DECISIONS.md.
// ============================================================================
const GENERATION_HUE_START = 270; // violet, generation 0
const GENERATION_HUE_END = 0; // red, generation 6

export function hueForGeneration(g: number): number {
  const clamped = Math.max(0, Math.min(6, g));
  return GENERATION_HUE_START - (GENERATION_HUE_START - GENERATION_HUE_END) * (clamped / 6);
}

/**
 * Recolors `hex` to the hue for generation `g`, preserving its own
 * saturation/lightness (so different archetypes seeded with slightly
 * different base S/L still read as subtly distinct even at the same
 * generation, while all landing on the same hue).
 */
export function applyGenerationHue(hex: string, g: number): string {
  const { r, g: gg, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, gg, b);
  const rgb = hslToRgb({ h: hueForGeneration(g), s: hsl.s, l: hsl.l });
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}
