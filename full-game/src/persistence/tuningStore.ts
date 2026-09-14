// Persistence for the live tuning panel (post-launch dev tool) — see
// config.ts::TuningOverride/TUNING_KNOBS and game.ts/ui/tuningPanel.ts.
//
// Keyed by difficulty so a player's Hard tuning never leaks onto Easy (or
// vice versa) — each difficulty tier gets its own independent saved
// override, read back automatically the next time that difficulty is
// selected (see game.ts::reset()).
//
// Every localStorage access is wrapped in try/catch: private browsing, a
// site-data block, or a storage quota error should degrade to "no saved
// tuning" rather than crashing the game.
import { TUNING_KNOBS, type DifficultyId, type TuningOverride } from '../config.ts';

const KEY_PREFIX = 'wave-defense-full:tuning:';

function keyFor(difficultyId: DifficultyId): string {
  return `${KEY_PREFIX}${difficultyId}`;
}

/** Reads the saved tuning override for one difficulty; {} if none/unreadable/corrupt. */
export function loadTuning(difficultyId: DifficultyId): TuningOverride {
  try {
    const raw = localStorage.getItem(keyFor(difficultyId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: TuningOverride = {};
    for (const knob of TUNING_KNOBS) {
      const v = (parsed as Record<string, unknown>)[knob.id];
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[knob.id] = Math.max(knob.min, Math.min(knob.max, v));
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Saves (or, if empty, clears) the tuning override for one difficulty. */
export function saveTuning(difficultyId: DifficultyId, override: TuningOverride): void {
  try {
    if (Object.keys(override).length === 0) {
      localStorage.removeItem(keyFor(difficultyId));
      return;
    }
    localStorage.setItem(keyFor(difficultyId), JSON.stringify(override));
  } catch {
    // Private browsing / disabled storage / quota exceeded — fail silently,
    // the live in-session values still work, they just won't persist.
  }
}

/** Explicitly clears a difficulty's saved override (the panel's reset action). */
export function clearTuning(difficultyId: DifficultyId): void {
  try {
    localStorage.removeItem(keyFor(difficultyId));
  } catch {
    // ignore
  }
}
