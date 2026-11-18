export class AudioManager {
  private ctx: AudioContext | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private nitroGain: GainNode | null = null;
  public isMuted = false;
  private isRunning = false;

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public startEngineLoop(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.isRunning) return;

    try {
      this.engineOsc1 = ctx.createOscillator();
      this.engineOsc2 = ctx.createOscillator();
      this.engineFilter = ctx.createBiquadFilter();
      this.engineGain = ctx.createGain();
      this.nitroGain = ctx.createGain();

      this.engineOsc1.type = 'sawtooth';
      this.engineOsc2.type = 'triangle';
      this.engineOsc1.frequency.value = 55;
      this.engineOsc2.frequency.value = 110;

      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 280;

      this.engineGain.gain.value = 0.03;
      this.nitroGain.gain.value = 0;

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(ctx.destination);

      this.engineOsc1.start();
      this.engineOsc2.start();
      this.isRunning = true;
    } catch {
      // Ignore Web Audio autoplay restrictions in headless browsers
    }
  }

  public updateEngine(rpm: number, throttle: number, nitroActive: boolean, active: boolean): void {
    if (!this.isRunning || !this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineGain || !this.engineFilter) {
      return;
    }
    if (this.isMuted || !active) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }

    const baseFreq = 38 + (rpm / 9500) * 145 + (nitroActive ? 28 : 0);
    const now = this.ctx.currentTime;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(
      240 + throttle * 420 + (nitroActive ? 500 : 0),
      now,
      0.05
    );
    this.engineGain.gain.setTargetAtTime(
      0.025 + throttle * 0.035 + (nitroActive ? 0.02 : 0),
      now,
      0.05
    );
  }

  public stopEngineLoop(): void {
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopEngineLoop();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }
    }
    return this.isMuted;
  }

  public playCommentaryRadioChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1040, now);
      osc.frequency.setValueAtTime(1480, now + 0.045);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Ignore
    }
  }

  public playCountdownTone(isGo: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = isGo ? 880 : 440;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isGo ? 0.38 : 0.18));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (isGo ? 0.4 : 0.2));
    } catch {
      // Ignore
    }
  }

  public playCollisionImpact(intensity = 0.6): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120 + Math.random() * 30, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(Math.min(0.14, 0.05 + intensity * 0.09), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // Ignore
    }
  }

  public playCheckpointChime(isLap = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(isLap ? 660 : 520, now);
      osc.frequency.setValueAtTime(isLap ? 990 : 780, now + 0.07);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.25);
    } catch {
      // Ignore
    }
  }

  public playRaceFinish(won: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 349.23, 311.13, 261.63];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = ctx.currentTime + idx * 0.11;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.08, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.34);
      });
    } catch {
      // Ignore
    }
  }
}
