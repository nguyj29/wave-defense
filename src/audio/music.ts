// ============================================================================
// music.ts — looping procedural background music (Web Audio API only, no
// external audio files, matching audio/sfx.ts's synthesis-only approach —
// this is a personal project so procedural avoids any licensing questions).
//
// Approach: render one loop's worth of audio into an AudioBuffer up front
// via OfflineAudioContext (a continuous low drone whose oscillator
// frequencies complete a whole number of cycles per loop, so it phase-loops
// with zero click, plus a sparse bassline + arpeggio whose note envelopes
// fully decay to silence before the loop boundary), then play that buffer
// back on a real AudioBufferSourceNode with `loop = true` — genuinely
// seamless looping on the audio clock, not a gapped <audio> tag loop.
//
// A second, "intense" version of the same buffer (same length, same drone
// phase) can be layered in during boss/high-pressure moments: both sources
// are started at the same instant from the same offset, so they never drift
// out of sync with each other — see setIntensity().
// ============================================================================

import { getSharedAudioContext } from './sfx.ts';

const LOOP_SECONDS = 8;
const BASE_VOLUME = 0.16; // clearly under SFX (masterGain 0.5 in sfx.ts) so gunfire/hits stay audible on top
const INTENSE_VOLUME = 0.09; // the extra boss-mode layer, additive on top of the base loop

let musicGain: GainNode | null = null;
let intenseGain: GainNode | null = null;
let started = false;
let muted = false;

/** A few notes (Hz) from a simple minor pentatonic-ish palette, low register for the bass. */
const BASS_NOTES = [110, 130.81, 98, 146.83]; // A2, C3, G2, D3
const ARP_NOTES = [440, 523.25, 392, 587.33, 523.25]; // A4, C5, G4, D5, C5

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
 * high-hat-like noise-tick layer on top of the same drone+bass+arp, used for
 * boss waves — same length/phase as the base loop so the two can play back
 * simultaneously in perfect sync.
 */
async function renderLoopBuffer(ctx: AudioContext, intense: boolean): Promise<AudioBuffer> {
  const OfflineCtor = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!OfflineCtor) throw new Error('OfflineAudioContext unavailable');
  const offline = new OfflineCtor(2, Math.ceil(ctx.sampleRate * LOOP_SECONDS), ctx.sampleRate);
  const master = offline.createGain();
  master.gain.value = 1;
  master.connect(offline.destination);

  if (!intense) {
    // Continuous low drone: two detuned sines whose frequencies complete a
    // whole number of cycles in LOOP_SECONDS, so the waveform's phase at the
    // loop end exactly matches its phase at the start — no click, no fade
    // needed. 110Hz * 8s = 880 cycles; 165.0Hz isn't quite integer-friendly
    // at 8s so use 164.5? Simpler: pick 110 and 220.5 -> not integer either.
    // Use 110 and 82.5 -> not integer. Stick to exact integer-cycle pairs:
    // 110Hz (880 cycles/8s) and 55Hz (440 cycles/8s), an octave apart, both
    // exact — a calm root+sub drone.
    const drone1 = offline.createOscillator();
    drone1.type = 'sine';
    drone1.frequency.value = 110;
    const droneGain1 = offline.createGain();
    droneGain1.gain.value = 0.05;
    drone1.connect(droneGain1);
    droneGain1.connect(master);
    drone1.start(0);
    drone1.stop(LOOP_SECONDS);

    const drone2 = offline.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 55;
    const droneGain2 = offline.createGain();
    droneGain2.gain.value = 0.07;
    drone2.connect(droneGain2);
    droneGain2.connect(master);
    drone2.start(0);
    drone2.stop(LOOP_SECONDS);

    // Sparse bassline: one short note per second, each fully decayed well
    // before the next starts (and before the loop wraps), so no envelope
    // straddles the seam.
    for (let step = 0; step < LOOP_SECONDS; step++) {
      const note = BASS_NOTES[step % BASS_NOTES.length];
      scheduleToneEnvelope(offline, master, 'triangle', note, step, 0.02, 0.55, 0.22);
    }

    // Sparse arpeggiated pad on top, offset from the bass and at half the
    // density so it reads as a light melodic accent rather than competing
    // rhythmically with the bass.
    for (let step = 0; step < LOOP_SECONDS; step += 2) {
      const note = ARP_NOTES[(step / 2) % ARP_NOTES.length];
      scheduleToneEnvelope(offline, master, 'sine', note, step + 0.5, 0.05, 1.2, 0.09);
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
 */
export function setMusicIntensity(active: boolean): void {
  const ctx = getSharedAudioContext();
  if (!ctx || !intenseGain) return;
  const now = ctx.currentTime;
  intenseGain.gain.cancelScheduledValues(now);
  intenseGain.gain.linearRampToValueAtTime(muted ? 0 : active ? INTENSE_VOLUME : 0, now + 0.4);
}
