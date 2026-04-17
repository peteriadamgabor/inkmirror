/**
 * Sonification engine. Maps the active chapter's dominant label to a
 * looping tone — the app's ambient heartbeat while drafting.
 *
 * Handles both the legacy 3-class sentiment ('positive'/'neutral'/'negative')
 * and the Near tier's 10 moods. Unknown labels fall back to the neutral
 * profile. Per-mood tuning is deliberately conservative: clear
 * intervalic differences between nearby moods (tender vs calm vs joy)
 * but nothing jarring — the audio should sit under the prose, not in
 * front of it.
 *
 * One synth, one gain, one filter, one loop. No reverb chain. Tone.js
 * is dynamically imported on first start() so its ~240 KB runtime
 * stays off the main chunk. AudioContext is locked until a user
 * gesture — start() must be called from a click handler.
 */

export type MoodLabel =
  | 'positive' | 'neutral' | 'negative'
  | 'tender' | 'tension' | 'dread' | 'longing' | 'grief'
  | 'hope' | 'joy' | 'wonder' | 'rage' | 'calm';

interface MoodProfile {
  baseFreq: number;
  intervalHz: number[]; // frequency ratios against baseFreq
  stepMs: number;
  filterHz: number;
}

const PROFILES: Record<MoodLabel, MoodProfile> = {
  // Legacy 3-class — Basic profile
  positive: { baseFreq: 440, intervalHz: [1, 1.26, 1.5],        stepMs: 600,  filterHz: 3000 },
  neutral:  { baseFreq: 293, intervalHz: [1, 1.189],              stepMs: 1000, filterHz: 1500 },
  negative: { baseFreq: 196, intervalHz: [1, 1.189, 1.414],       stepMs: 1400, filterHz: 700  },

  // Near tier — 10 moods, tuned to sit on a valence+arousal grid.
  // Positive / high-arousal (joy, hope, wonder): bright, quick.
  joy:     { baseFreq: 523, intervalHz: [1, 1.26, 1.5, 2],        stepMs: 480,  filterHz: 3800 }, // C5 major 7
  hope:    { baseFreq: 440, intervalHz: [1, 1.2, 1.5],             stepMs: 680,  filterHz: 2800 }, // A4 major
  wonder:  { baseFreq: 392, intervalHz: [1, 1.25, 1.5, 1.875],     stepMs: 760,  filterHz: 3200 }, // G4 suspended, shimmering
  // Positive / low-arousal (tender, calm): warm, slow.
  tender:  { baseFreq: 349, intervalHz: [1, 1.2, 1.5],             stepMs: 1100, filterHz: 1900 }, // F4 major, soft
  calm:    { baseFreq: 294, intervalHz: [1, 1.25, 1.5],             stepMs: 1400, filterHz: 1400 }, // D4 major, still
  // Neutral-ish, yearning.
  longing: { baseFreq: 311, intervalHz: [1, 1.189, 1.5],           stepMs: 1200, filterHz: 1600 }, // Eb4 minor, hanging
  // Negative / high-arousal (tension, rage): sharp, driving.
  tension: { baseFreq: 277, intervalHz: [1, 1.09, 1.19],            stepMs: 500,  filterHz: 2200 }, // C#4 tight, pulsing
  rage:    { baseFreq: 233, intervalHz: [1, 1.189, 1.414, 1.682],  stepMs: 420,  filterHz: 2600 }, // Bb3 diminished, driving
  // Negative / low-arousal (dread, grief): dark, heavy.
  dread:   { baseFreq: 174, intervalHz: [1, 1.06, 1.414],          stepMs: 1800, filterHz: 500  }, // F3 semitone + tritone
  grief:   { baseFreq: 196, intervalHz: [1, 1.189, 1.5],            stepMs: 1600, filterHz: 600  }, // G3 minor, slow
};

/**
 * Resolve any label to a valid MoodLabel profile key. Unknown strings
 * fall back to 'neutral' so a stray model output or old row never
 * hangs the audio loop.
 */
export function resolveMoodLabel(label: string | null | undefined): MoodLabel {
  if (!label) return 'neutral';
  return (label in PROFILES ? label : 'neutral') as MoodLabel;
}

// Loosely typed Tone.js references so the main chunk doesn't pull in
// Tone types. Narrowed at runtime after dynamic import.
type ToneModule = typeof import('tone');
type ToneAny = unknown;

export class SonificationEngine {
  private Tone: ToneModule | null = null;
  private synth: ToneAny = null;
  private filter: ToneAny = null;
  private gain: ToneAny = null;
  private loop: ToneAny = null;
  private currentProfile: MoodLabel = 'neutral';
  private stepIdx = 0;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Must be called from a user-gesture click handler.
   */
  async start(initialMood: MoodLabel = 'neutral'): Promise<void> {
    if (this.running) return;
    if (!this.Tone) {
      this.Tone = await import('tone');
    }
    const Tone = this.Tone;
    await Tone.start(); // unlock AudioContext
    if (!this.gain) {
      const gain = new Tone.Gain(0.08).toDestination();
      const filter = new Tone.Filter(1500, 'lowpass');
      (filter as unknown as { connect: (n: unknown) => unknown }).connect(gain);
      const synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.12, decay: 0.3, sustain: 0.4, release: 0.8 },
      });
      (synth as unknown as { connect: (n: unknown) => unknown }).connect(filter);
      this.gain = gain;
      this.filter = filter;
      this.synth = synth;
    }
    this.currentProfile = initialMood;
    this.stepIdx = 0;
    this.updateProfileParams();

    this.loop = new Tone.Loop((time) => {
      const profile = PROFILES[this.currentProfile];
      const ratio = profile.intervalHz[this.stepIdx % profile.intervalHz.length];
      const freq = profile.baseFreq * ratio;
      const synth = this.synth as { triggerAttackRelease?: (f: number, d: string, t: unknown) => void } | null;
      synth?.triggerAttackRelease?.(freq, '8n', time);
      this.stepIdx++;
    }, '0.6s').start(0);

    Tone.getTransport().start();
    this.running = true;
  }

  stop(): void {
    if (!this.running || !this.Tone) return;
    const loop = this.loop as { stop?: () => void; dispose?: () => void } | null;
    loop?.stop?.();
    loop?.dispose?.();
    this.loop = null;
    this.Tone.getTransport().stop();
    this.running = false;
  }

  setMood(mood: MoodLabel): void {
    if (this.currentProfile === mood) return;
    this.currentProfile = mood;
    this.stepIdx = 0;
    this.updateProfileParams();
  }

  private updateProfileParams(): void {
    if (!this.Tone) return;
    const profile = PROFILES[this.currentProfile];
    const filter = this.filter as {
      frequency?: { rampTo: (hz: number, t: number) => void };
    } | null;
    filter?.frequency?.rampTo(profile.filterHz, 0.8);
    const loop = this.loop as { interval?: number } | null;
    if (loop) {
      loop.interval = profile.stepMs / 1000;
    }
  }
}

let singleton: SonificationEngine | null = null;
export function getSonificationEngine(): SonificationEngine {
  if (!singleton) singleton = new SonificationEngine();
  return singleton;
}
