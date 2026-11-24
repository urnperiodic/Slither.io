class GameAudio {
  private ctx: AudioContext | null = null;
  private muted = false;
  private eatCombo = 0;
  private lastEatAt = 0;
  private boostOsc: OscillatorNode | null = null;
  private boostGain: GainNode | null = null;
  private boostingActive = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.setBoosting(false);
    }
  }

  playEat(massGain: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const msNow = performance.now();
    if (msNow - this.lastEatAt < 320) {
      this.eatCombo = Math.min(10, this.eatCombo + 1);
    } else {
      this.eatCombo = 0;
    }
    this.lastEatAt = msNow;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';

    const baseFreq = massGain >= 3 ? 520 : 380;
    const freq = baseFreq + this.eatCombo * 28 + Math.random() * 20;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.42, now + 0.075);

    const peak = massGain >= 3 ? 0.085 : 0.045;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  setBoosting(active: boolean): void {
    if (this.muted) active = false;
    if (active === this.boostingActive) return;
    this.boostingActive = active;

    if (active) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(92, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.032, now + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);

      this.boostOsc = osc;
      this.boostGain = gain;
    } else {
      if (this.boostGain && this.ctx) {
        const now = this.ctx.currentTime;
        this.boostGain.gain.cancelScheduledValues(now);
        this.boostGain.gain.linearRampToValueAtTime(0.0005, now + 0.09);
      }
      if (this.boostOsc) {
        const oldOsc = this.boostOsc;
        setTimeout(() => {
          try {
            oldOsc.stop();
            oldOsc.disconnect();
          } catch {
            // ignore already stopped
          }
        }, 110);
      }
      this.boostOsc = null;
      this.boostGain = null;
    }
  }

  playKill(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  playDeath(): void {
    this.setBoosting(false);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.42);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, now);
    filter.frequency.exponentialRampToValueAtTime(110, now + 0.42);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }
}

export const gameAudio = new GameAudio();
