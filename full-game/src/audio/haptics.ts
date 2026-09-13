// ============================================================================
// haptics.ts — best-effort haptic feedback: Gamepad API rumble
// (`vibrationActuator`) when a gamepad is connected, plus `navigator.vibrate`
// on mobile browsers that support it. Both are feature-detected and wrapped
// in try/catch, so this is a total no-op (never throws, never logs) on a
// standard desktop mouse+keyboard session with no gamepad — which is
// expected to be the common case for this project right now. See
// DECISIONS.md: this is explicitly best-effort/likely-imperceptible on
// standard desktop hardware, not a verified-felt feature.
//
// Single public entry point, `pulseHaptic(kind)`, mirrors the data-driven
// pattern in `audio/sfx.ts` (one lookup table of event -> pulse params)
// so it's easy to wire into the same call sites as SFX triggers and easy
// to extend/rip out later.
// ============================================================================

export type HapticKind = 'damage' | 'coreDamage' | 'shoot' | 'kill';

interface HapticPulse {
  durationMs: number; // gamepad rumble duration AND navigator.vibrate duration
  weakMagnitude: number; // 0..1, gamepad dual-rumble weak (high-frequency) motor
  strongMagnitude: number; // 0..1, gamepad dual-rumble strong (low-frequency) motor
}

// Kept short (~50-150ms) and modest (0.2-0.6 range) per the brief — this is
// polish, not a max-intensity rumble pack.
const HAPTIC_DEFS: Record<HapticKind, HapticPulse> = {
  damage: { durationMs: 120, weakMagnitude: 0.4, strongMagnitude: 0.5 },
  coreDamage: { durationMs: 140, weakMagnitude: 0.3, strongMagnitude: 0.6 },
  shoot: { durationMs: 50, weakMagnitude: 0.2, strongMagnitude: 0.2 }, // "a very light pulse"
  kill: { durationMs: 90, weakMagnitude: 0.3, strongMagnitude: 0.4 },
};

interface GamepadActuator {
  playEffect: (type: string, params: Record<string, number>) => Promise<unknown>;
}

function getVibrationActuator(): GamepadActuator | null {
  try {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      const actuator = (pad as unknown as { vibrationActuator?: GamepadActuator } | null)?.vibrationActuator;
      if (pad && pad.connected && actuator) return actuator;
    }
  } catch {
    // Gamepad API not available/blocked — fine, just no rumble.
  }
  return null;
}

/** Best-effort haptic pulse for a named gameplay event. Never throws, silently no-ops if unsupported. */
export function pulseHaptic(kind: HapticKind): void {
  const def = HAPTIC_DEFS[kind];
  if (!def) return;

  const actuator = getVibrationActuator();
  if (actuator) {
    try {
      actuator
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: def.durationMs,
          weakMagnitude: def.weakMagnitude,
          strongMagnitude: def.strongMagnitude,
        })
        .catch(() => {});
    } catch {
      // Some browsers implement vibrationActuator but reject unsupported
      // effect types/params — swallow it, this is purely best-effort polish.
    }
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(Math.min(50, def.durationMs));
    }
  } catch {
    // navigator.vibrate can throw in some restricted contexts (e.g. iframes
    // without the "vibrate" permission policy) — never let that break gameplay.
  }
}
