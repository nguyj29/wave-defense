// ============================================================================
// spriteRegistry.ts — Phase 5 "sprite-descriptor readiness." No real sprite
// assets exist yet (that's explicitly out of this phase's scope — the brief
// asked for readiness, not the asset swap itself), but this is the single,
// already-wired drop-in point for when they do: register a grayscale
// HTMLImageElement per archetype/shape key here, and render/renderer.ts's
// drawEntity (and rendererDetailed's drawEntityDetailed) will start drawing
// it — tinted per-entity by e.color via `tintedSprite()`, which is exactly
// the same "compute a final color, apply it to whatever the visual
// representation is" shape that render/colorUtils.ts's
// applyGenerationHue/warmHexColor already use for the current vector-shape
// rendering. Until an entry is registered for a key, `getSprite()` returns
// null and the caller falls back to the existing flat/detailed vector-shape
// rendering — so this is a no-op today by construction, not a parallel
// rendering path that needs separate testing.
//
// The existing F10 flat/detailed render-style toggle (render/renderer.ts vs
// render/rendererDetailed.ts) is UNCHANGED and stays meaningful even once
// sprites exist: both would draw the same sprite (once registered), tinted
// the same way — 'detailed' would still add its shading/shadow/highlight
// treatment as an overlay on top, exactly as it currently does for vector
// shapes. Neither rendering style is "the sprite one."
// ============================================================================

const registry = new Map<string, HTMLImageElement>();

/** Registers a grayscale source image for a sprite key (e.g. an archetype id). Call once assets exist; a no-op registry today. */
export function registerSprite(key: string, image: HTMLImageElement): void {
  registry.set(key, image);
}

/** Returns the registered sprite for `key`, or null if none has been registered (the expected case throughout Phase 1-5 of this project). */
export function getSprite(key: string | undefined): HTMLImageElement | null {
  if (!key) return null;
  return registry.get(key) ?? null;
}

// Cache of tinted offscreen canvases, keyed by `${spriteKey}|${color}`, so
// re-tinting the same sprite+color combo every frame doesn't re-run the
// multiply-blend each time. Bounded implicitly by the small number of
// distinct (archetype, generation-hue) combinations that actually occur.
const tintCache = new Map<string, HTMLCanvasElement>();

/**
 * Returns a version of `image` multiplied by `color` (a '#rrggbb' hex),
 * suitable for drawing in place of a flat-fill vector shape — the same
 * "one grayscale asset, tinted per-generation at runtime" approach the
 * Phase 1 brief described for the eventual sprite system. Cached per
 * (image, color) pair.
 */
export function tintedSprite(key: string, image: HTMLImageElement, color: string): HTMLCanvasElement {
  const cacheKey = `${key}|${color}`;
  const cached = tintCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(image, 0, 0);
  tintCache.set(cacheKey, canvas);
  return canvas;
}
