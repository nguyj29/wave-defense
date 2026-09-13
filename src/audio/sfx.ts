// ============================================================================
// sfx.ts — small procedurally-synthesized sound-effect engine (Web Audio
// API only, no external audio files). Every sound is a data-driven list of
// "layers" (a tone sweep or a filtered noise burst) in SFX_DEFS below; the
// actual oscillator/gain/filter wiring lives once in playLayer/playSfx, so
// adding a new sound is a config entry, never a scattered ad-hoc
// AudioContext call somewhere in gameplay code. Aiming for a punchy,
// slightly cartoonish "Roblox SFX" feel — short and clear, not realistic.
// ============================================================================

type Wave = OscillatorType;

interface ToneLayer {
  kind: 'tone';
  wave: Wave;
  freqStart: number;
  freqEnd: number; // exponential glide target; equal to freqStart for no glide
  gain: number; // peak gain, 0..1
  attack: number; // seconds to reach peak gain
  decay: number; // seconds from peak back down to ~silent
  delay?: number; // seconds after the sfx starts before this layer begins
}

interface NoiseLayer {
  kind: 'noise';
  gain: number;
  attack: number;
  decay: number;
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ?: number;
  delay?: number;
}

type SfxLayer = ToneLayer | NoiseLayer;

export type SfxName =
  | 'rifleShot'
  | 'pistolShot'
  | 'reload'
  | 'enemyHit'
  | 'enemyDeathGrunt'
  | 'enemyDeathArcher'
  | 'enemyDeathBoss'
  | 'allySummon'
  | 'allyHit'
  | 'playerHurt'
  | 'coreHurt'
  | 'coinPickup'
  | 'gemPickup'
  | 'shopOpen'
  | 'shopPurchase'
  | 'uiHover'
  | 'uiClick';

const SFX_DEFS: Record<SfxName, SfxLayer[]> = {
  // Rapid, sharp, higher-pitched, short — reads as automatic-rifle "crack".
  rifleShot: [
    { kind: 'tone', wave: 'sawtooth', freqStart: 1500, freqEnd: 320, gain: 0.35, attack: 0.001, decay: 0.05 },
    { kind: 'noise', gain: 0.22, attack: 0.001, decay: 0.035, filterType: 'highpass', filterFreq: 2500 },
  ],
  // Punchier, lower, single-shot feel.
  pistolShot: [
    { kind: 'tone', wave: 'square', freqStart: 320, freqEnd: 90, gain: 0.45, attack: 0.001, decay: 0.12 },
    { kind: 'noise', gain: 0.25, attack: 0.001, decay: 0.08, filterType: 'lowpass', filterFreq: 1200 },
  ],
  // A couple short mechanical clicks/blips.
  reload: [
    { kind: 'tone', wave: 'square', freqStart: 900, freqEnd: 700, gain: 0.18, attack: 0.001, decay: 0.03 },
    { kind: 'tone', wave: 'square', freqStart: 900, freqEnd: 700, gain: 0.18, attack: 0.001, decay: 0.03, delay: 0.13 },
  ],
  // Short thud when an enemy takes damage but survives.
  enemyHit: [
    { kind: 'tone', wave: 'triangle', freqStart: 220, freqEnd: 110, gain: 0.22, attack: 0.001, decay: 0.08 },
    { kind: 'noise', gain: 0.12, attack: 0.001, decay: 0.05, filterType: 'lowpass', filterFreq: 900 },
  ],
  enemyDeathGrunt: [{ kind: 'tone', wave: 'sawtooth', freqStart: 300, freqEnd: 55, gain: 0.32, attack: 0.001, decay: 0.25 }],
  enemyDeathArcher: [{ kind: 'tone', wave: 'sawtooth', freqStart: 420, freqEnd: 90, gain: 0.3, attack: 0.001, decay: 0.22 }],
  // Bigger, lower-pitched — a rumble under the descending tone.
  enemyDeathBoss: [
    { kind: 'tone', wave: 'sine', freqStart: 160, freqEnd: 30, gain: 0.5, attack: 0.001, decay: 0.8 },
    { kind: 'noise', gain: 0.28, attack: 0.001, decay: 0.6, filterType: 'lowpass', filterFreq: 260 },
  ],
  // Rising magical two-note blip for the summon cast.
  allySummon: [
    { kind: 'tone', wave: 'sine', freqStart: 300, freqEnd: 900, gain: 0.28, attack: 0.02, decay: 0.22 },
    { kind: 'tone', wave: 'sine', freqStart: 450, freqEnd: 1200, gain: 0.2, attack: 0.02, decay: 0.2, delay: 0.05 },
  ],
  // Light thwack when an ally's melee attack lands.
  allyHit: [{ kind: 'tone', wave: 'triangle', freqStart: 500, freqEnd: 250, gain: 0.2, attack: 0.001, decay: 0.06 }],
  playerHurt: [
    { kind: 'tone', wave: 'sawtooth', freqStart: 220, freqEnd: 80, gain: 0.32, attack: 0.001, decay: 0.15 },
    { kind: 'noise', gain: 0.18, attack: 0.001, decay: 0.1, filterType: 'lowpass', filterFreq: 700 },
  ],
  // Lower/distinct from playerHurt so the base-under-attack cue is
  // recognizable without looking at the HP bar; a second lower thud gives it
  // an "alarm" double-hit character.
  coreHurt: [
    { kind: 'tone', wave: 'sine', freqStart: 95, freqEnd: 40, gain: 0.42, attack: 0.001, decay: 0.35 },
    { kind: 'noise', gain: 0.2, attack: 0.001, decay: 0.3, filterType: 'lowpass', filterFreq: 200 },
    { kind: 'tone', wave: 'sine', freqStart: 90, freqEnd: 38, gain: 0.3, attack: 0.001, decay: 0.3, delay: 0.14 },
  ],
  coinPickup: [{ kind: 'tone', wave: 'sine', freqStart: 700, freqEnd: 1300, gain: 0.22, attack: 0.001, decay: 0.1 }],
  // Brighter/shinier than coinPickup — a two-note sparkle chime so a gem
  // pickup reads as a rarer, more valuable event than a plain coin blip.
  gemPickup: [
    { kind: 'tone', wave: 'sine', freqStart: 1200, freqEnd: 2200, gain: 0.24, attack: 0.001, decay: 0.12 },
    { kind: 'tone', wave: 'sine', freqStart: 1800, freqEnd: 3000, gain: 0.18, attack: 0.001, decay: 0.14, delay: 0.06 },
  ],
  shopOpen: [{ kind: 'tone', wave: 'triangle', freqStart: 400, freqEnd: 700, gain: 0.2, attack: 0.02, decay: 0.15 }],
  shopPurchase: [
    { kind: 'tone', wave: 'square', freqStart: 600, freqEnd: 900, gain: 0.2, attack: 0.001, decay: 0.08 },
    { kind: 'tone', wave: 'square', freqStart: 800, freqEnd: 1100, gain: 0.2, attack: 0.001, decay: 0.1, delay: 0.08 },
  ],
  // Short, crisp, distinct from gameplay SFX — generic UI feedback for hover
  // and click on interactive panel elements (shop rows/tabs).
  uiHover: [{ kind: 'tone', wave: 'sine', freqStart: 500, freqEnd: 650, gain: 0.08, attack: 0.001, decay: 0.03 }],
  uiClick: [{ kind: 'tone', wave: 'triangle', freqStart: 700, freqEnd: 500, gain: 0.16, attack: 0.001, decay: 0.05 }],
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

/** Create/resume the shared AudioContext. Call this from a user-gesture handler (browser autoplay policy). */
export function initAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const len = c.sampleRate; // 1s of white noise, reused (sliced via stop time) for every noise layer
    noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function playLayer(c: AudioContext, out: AudioNode, layer: SfxLayer, startAt: number): void {
  const start = startAt + (layer.delay ?? 0);
  const totalDur = Math.max(0.02, layer.attack + layer.decay);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, layer.gain), start + Math.max(layer.attack, 0.001));
  g.gain.exponentialRampToValueAtTime(0.0001, start + totalDur);
  g.connect(out);

  if (layer.kind === 'tone') {
    const osc = c.createOscillator();
    osc.type = layer.wave;
    osc.frequency.setValueAtTime(Math.max(1, layer.freqStart), start);
    if (layer.freqEnd !== layer.freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, layer.freqEnd), start + totalDur);
    }
    osc.connect(g);
    osc.start(start);
    osc.stop(start + totalDur + 0.02);
  } else {
    const src = c.createBufferSource();
    src.buffer = getNoiseBuffer(c);
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = layer.filterType;
    filter.frequency.value = layer.filterFreq;
    if (layer.filterQ) filter.Q.value = layer.filterQ;
    src.connect(filter);
    filter.connect(g);
    src.start(start);
    src.stop(start + totalDur + 0.02);
  }
}

/** Plays a named sound effect immediately. Silently no-ops if Web Audio isn't available/ready. */
export function playSfx(name: SfxName, volume = 1): void {
  const c = getCtx();
  if (!c || !masterGain) return;
  if (c.state === 'suspended') {
    // Autoplay policy: a stray call before the first user gesture just
    // doesn't play rather than throwing — initAudio() on first input is what
    // actually unlocks sound for the rest of the session.
    return;
  }
  const def = SFX_DEFS[name];
  if (!def) return;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(masterGain);
  const now = c.currentTime;
  for (const layer of def) playLayer(c, out, layer, now);
}
