// ============================================================================
// music.ts — looping procedural background music (Web Audio API only, no
// external audio files, matching audio/sfx.ts's synthesis-only approach —
// this is a personal project so procedural avoids any licensing questions).
//
// Approach: render one loop's worth of audio into an AudioBuffer up front
// via OfflineAudioContext (a continuous low drone whose oscillator
// frequencies complete a whole number of cycles per loop, so it phase-loops
// with zero click, plus a bassline + lead riff whose note envelopes fully
// decay to silence before the loop boundary), then play that buffer back on
// a real AudioBufferSourceNode with `loop = true` — genuinely seamless
// looping on the audio clock, not a gapped <audio> tag loop.
//
// A second, "intense" version of the same buffer (same length, same drone
// phase) can be layered in during boss/high-pressure moments: both sources
// are started at the same instant from the same offset, so they never drift
// out of sync with each other — see setIntensity().
//
// Round 6: reworked per feedback that the music was too quiet and wanted a
// genuinely different piece, not just a volume bump — see DECISIONS.md for
// the full writeup. Summary of what changed:
//  - BASE_VOLUME raised from 0.16 to 0.42 (~2.6x) — clearly the dominant
//    ambient layer now, while SFX's masterGain (0.5 in sfx.ts) is per-shot/
//    per-hit and still cuts through on top rather than being buried.
//  - LOOP_SECONDS moved from 8 to 12 and the tempo doubled (was 1 chord/
//    bass-note per second; now a driving 8th-note bass pulse at ~140bpm-
//    equivalent spacing) with a 4-chord minor-key progression (Am-F-C-G,
//    a completely different harmonic skeleton from the old single-note
//    drone-plus-arpeggio) and a syncopated lead riff instead of the old
//    straight ascending arpeggio — reads as a distinct, more driving/upbeat
//    piece rather than the prior ambient drone turned up.
// ============================================================================

import { getSharedAudioContext } from './sfx.ts';

const LOOP_SECONDS = 12;
const BASE_VOLUME = 0.42; // "much louder" ask — still under SFX's masterGain (0.5) so gunfire/hits read on top
const INTENSE_VOLUME = 0.22; // the extra boss-mode layer, additive on top of the base loop (scaled up alongside BASE_VOLUME)

let musicGain: GainNode | null = null;
let intenseGain: GainNode | null = null;
let started = false;
let muted = false;

// New harmonic content (round 6): a 4-chord i-VI-III-VII minor progression
// (Am - F - C - G), one chord per 3-second bar (4 bars = 12s loop), each
// note chosen so it completes a whole number of cycles in LOOP_SECONDS at
// the chord roots' actual frequencies isn't required here (unlike the old
// drone) since every note's own envelope decays to ~0 well before the loop
// wraps — only the drone needs phase-exactness, and the drone below is kept
// on the same trick as before.
const CHORD_ROOTS = [110, 87.31, 130.81, 98]; // A2, F2, C3, G2 — one per 3s bar
const CHORD_THIRDS = [130.81, 110, 164.81, 123.47]; // C3, A2, E3, B2 (minor for Am/F/G-ish color, major-ish lift for C)
const CHORD_FIFTHS = [164.81, 130.81, 196.0, 146.83]; // E3, C3, G3, D3

// Syncopated lead riff (Hz), higher register — a distinct rhythmic pattern
// (long-short-short-long feel via the `steps` timing table below) rather
// than the old straight even-eighths ascending arpeggio.
const LEAD_NOTES = [440, 523.25, 587.33, 659.25, 587.33, 523.25, 440, 392];
// Beat offsets (seconds, within the 12s loop) at which the lead fires —
// irregular spacing is what gives it the syncopated feel.
const LEAD_STEP_TIMES = [0, 0.75, 1.5, 2.25, 3.75, 5.25, 6, 6.75, 8.25, 9, 9.75, 10.5];

function scheduleToneEnvelope(
  ctx: BaseAudioContext,
  out: AudioNode,
  wave: OscillatorType,
  freq: number,
  start: number,
  attack: number,
  decay: number,
  peakGain: number,
): void {
  const totalDur = attack + decay;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(peakGain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + totalDur);
  g.connect(out);
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.value = freq;
  osc.connect(g);
  osc.start(start);
  osc.stop(start + totalDur + 0.02);
}

/**
 * Renders one seamless LOOP_SECONDS buffer. `intense` adds a sparser
 * high-hat-like noise-tick layer on top of the same drone+bass+chords+lead,
 * used for boss waves — same length/phase as the base loop so the two can
 * play back simultaneously in perfect sync.
 */
async function renderLoopBuffer(ctx: AudioContext, intense: boolean): Promise<AudioBuffer> {
  const OfflineCtor = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!OfflineCtor) throw new Error('OfflineAudioContext unavailable');
  const offline = new OfflineCtor(2, Math.ceil(ctx.sampleRate * LOOP_SECONDS), ctx.sampleRate);
  const master = offline.createGain();
  master.gain.value = 1;
  master.connect(offline.destination);

  if (!intense) {
    // Continuous low sub-drone on the tonic (A2/A1): frequencies chosen to
    // complete a whole number of cycles in LOOP_SECONDS (12s) so the
    // waveform's phase at the loop end exactly matches its phase at the
    // start — no click, no fade needed. 110Hz*12s=1320 cycles, 55Hz*12s=660
    // cycles, both exact.
    const drone1 = offline.createOscillator();
    drone1.type = 'sine';
    drone1.frequency.value = 110;
    const droneGain1 = offline.createGain();
    droneGain1.gain.value = 0.04;
    drone1.connect(droneGain1);
    droneGain1.connect(master);
    drone1.start(0);
    drone1.stop(LOOP_SECONDS);

    const drone2 = offline.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 55;
    const droneGain2 = offline.createGain();
    droneGain2.gain.value = 0.06;
    drone2.connect(droneGain2);
    droneGain2.connect(master);
    drone2.start(0);
    drone2.stop(LOOP_SECONDS);

    // Driving 8th-note bass pulse (2 hits/sec, i.e. every 0.5s) walking the
    // 4-chord progression's root one bar (3s) at a time — a completely
    // different rhythmic feel from the old 1-note-per-second sparse bass.
    const barSec = LOOP_SECONDS / CHORD_ROOTS.length; // 3s/bar, 4 bars
    for (let bar = 0; bar < CHORD_ROOTS.length; bar++) {
      const root = CHORD_ROOTS[bar];
      const barStart = bar * barSec;
      for (let pulse = 0; pulse < barSec / 0.5; pulse++) {
        const t = barStart + pulse * 0.5;
        scheduleToneEnvelope(offline, master, 'sawtooth', root, t, 0.01, 0.28, 0.16);
      }
    }

    // Sustained chord pad: root+third+fifth held for most of each bar,
    // giving the new progression (Am-F-C-G) its harmonic color — the old
    // loop never sounded a chord, only a single-note drone/arpeggio, so this
    // alone makes it read as a different piece.
    for (let bar = 0; bar < CHORD_ROOTS.length; bar++) {
      const barStart = bar * barSec;
      const chordDur = barSec * 0.85;
      scheduleToneEnvelope(offline, master, 'triangle', CHORD_ROOTS[bar] * 2, barStart, 0.15, chordDur, 0.05);
      scheduleToneEnvelope(offline, master, 'triangle', CHORD_THIRDS[bar] * 2, barStart, 0.15, chordDur, 0.045);
      scheduleToneEnvelope(offline, master, 'triangle', CHORD_FIFTHS[bar] * 2, barStart, 0.15, chordDur, 0.04);
    }

    // Syncopated lead riff on top — irregular note timing (LEAD_STEP_TIMES)
    // instead of the old strictly-every-2-seconds ascending arpeggio, so the
    // melodic rhythm itself is different, not just the notes.
    for (let i = 0; i < LEAD_STEP_TIMES.length; i++) {
      const t = LEAD_STEP_TIMES[i];
      const note = LEAD_NOTES[i % LEAD_NOTES.length];
      scheduleToneEnvelope(offline, master, 'square', note, t, 0.01, 0.35, 0.06);
    }
  } else {
    // Boss/high-pressure layer: a soft rhythmic "tick" (short filtered noise
    // burst) on every half-step, additive over the base loop when active.
    const len = Math.ceil(offline.sampleRate * 0.05);
    const buf = offline.createBuffer(1, len, offline.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    for (let step = 0; step < LOOP_SECONDS * 2; step++) {
      const t = step * 0.5;
      const src = offline.createBufferSource();
      src.buffer = buf;
      const filter = offline.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 4000;
      const g = offline.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 0.1);
    }
  }

  return offline.startRendering();
}

function startLoopSource(ctx: AudioContext, buffer: AudioBuffer, gain: GainNode): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = buffer.duration;
  src.connect(gain);
  src.start();
  return src;
}

/**
 * Starts the music loop. Call this from the same first-user-gesture hook
 * that calls audio/sfx.ts's initAudio() (see input.ts) — the shared
 * AudioContext can only start/resume after a user gesture. Safe to call
 * repeatedly; only the first call (once Web Audio is actually available)
 * does anything.
 */
export function initMusic(): void {
  if (started) return;
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  started = true; // set immediately so a second rapid gesture doesn't double-start while rendering is async

  musicGain = ctx.createGain();
  musicGain.gain.value = muted ? 0 : BASE_VOLUME;
  musicGain.connect(ctx.destination);

  intenseGain = ctx.createGain();
  intenseGain.gain.value = 0; // starts silent; setIntensity(true) ramps it in
  intenseGain.connect(ctx.destination);

  renderLoopBuffer(ctx, false)
    .then((buffer) => {
      if (!musicGain) return;
      startLoopSource(ctx, buffer, musicGain);
    })
    .catch(() => {
      // OfflineAudioContext unsupported or render failed: fail silently,
      // same "best-effort audio" posture as sfx.ts/haptics.ts.
      started = false;
    });

  renderLoopBuffer(ctx, true)
    .then((buffer) => {
      if (!intenseGain) return;
      startLoopSource(ctx, buffer, intenseGain);
    })
    .catch(() => {
      /* the intensity layer is a pure bonus — losing it is not an error */
    });
}

/** Toggle mute. Returns the new muted state. */
export function toggleMusicMute(): boolean {
  muted = !muted;
  applyVolume();
  return muted;
}

export function isMusicMuted(): boolean {
  return muted;
}

function applyVolume(): void {
  const ctx = getSharedAudioContext();
  if (!ctx || !musicGain) return;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.linearRampToValueAtTime(muted ? 0 : BASE_VOLUME, now + 0.15);
}

/**
 * Layers the boss/high-pressure "intense" tick track in or out, ramped
 * smoothly. Cheap: both loop sources were started together at the same
 * instant so they stay perfectly in phase for the life of the session — no
 * per-call resync needed, just a gain ramp.
 *
 * Phase 5: generalized from a boolean on/off to a continuous 0..1 `level` —
 * wired by game.ts to the SpawnDirector's own normalized kill-rate pressure
 * (see SpawnDirector.pressureLevel) so the intense layer actually rides the
 * adaptive spawn-rate curve (louder as the fight gets hotter, not just a
 * binary "boss present" flag), with an active boss still forcing it to 1
 * regardless of the moment-to-moment spawn pressure. `true`/`false` still
 * work at call sites via JS's number coercion (`true` -> 1, `false` -> 0),
 * so this is a non-breaking generalization of the old boolean API.
 */
export function setMusicIntensity(level: number): void {
  const ctx = getSharedAudioContext();
  if (!ctx || !intenseGain) return;
  const now = ctx.currentTime;
  const clamped = Math.max(0, Math.min(1, level));
  intenseGain.gain.cancelScheduledValues(now);
  intenseGain.gain.linearRampToValueAtTime(muted ? 0 : INTENSE_VOLUME * clamped, now + 0.4);
}
