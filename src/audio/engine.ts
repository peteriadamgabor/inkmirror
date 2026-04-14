/**
 * Minimal sonification baseline.
 *
 * Maps the active chapter's dominant sentiment to a looping tone:
 *   positive → bright, fast, high frequency (major)
 *   neutral  → medium, medium, medium
 *   negative → dark, slow, low frequency (minor)
 *
 * One synth, one gain, one filter, one loop. No reverb chain. Designed
 * as a baseline — richer mappings belong to later phases once we have
 * real mood granularity.
 *
 * Tone.js is dynamically imported on first start() so the ~240 KB
 * runtime stays off the main chunk until the user actually opts in.
 * AudioContext is locked by the browser until a user gesture — start()
 * must be called from a click handler.
 */

export type MoodLabel = 'positive' | 'neutral' | 'negative';

interface MoodProfile {
  baseFreq: number;
  intervalHz: number[]; // frequency ratios against baseFreq
  stepMs: number;
  filterHz: number;
}

const PROFILES: Record<MoodLabel, MoodProfile> = {
  positive: {
    baseFreq: 440, // A4
    intervalHz: [1, 1.26, 1.5], // major triad ratios
    stepMs: 600,
    filterHz: 3000,
  },
  neutral: {
    baseFreq: 293, // D4
    intervalHz: [1, 1.189], // minor third
    stepMs: 1000,
    filterHz: 1500,
  },
  negative: {
    baseFreq: 196, // G3
    intervalHz: [1, 1.189, 1.414], // diminished feel
    stepMs: 1400,
    filterHz: 700,
  },
};

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
