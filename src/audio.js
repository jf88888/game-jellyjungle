// Lightweight Web Audio synth. Muted by default; enabled via toggle / first gesture.

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = true;
    this._ensure = () => {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    };
  }

  setMuted(m) {
    this.muted = m;
    if (!m) this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _tone({ freq = 440, end = null, dur = 0.12, type = 'sine', vol = 0.5, delay = 0 }) {
    if (this.muted) return;
    this._ensure();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.1, vol = 0.3, freq = 800, delay = 0 }) {
    if (this.muted) return;
    this._ensure();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  click()      { this._tone({ freq: 660, end: 880, dur: 0.06, type: 'triangle', vol: 0.25 }); }
  jump()       { this._tone({ freq: 340, end: 620, dur: 0.14, type: 'sine', vol: 0.4 }); }
  airJump()    { this._tone({ freq: 460, end: 820, dur: 0.12, type: 'sine', vol: 0.35 }); }
  land()       { this._noise({ dur: 0.07, vol: 0.18, freq: 500 }); }
  spring()     { this._tone({ freq: 220, end: 980, dur: 0.3, type: 'sine', vol: 0.5 }); this._tone({ freq: 440, end: 1400, dur: 0.22, type: 'triangle', vol: 0.2, delay: 0.03 }); }
  crystal()    { this._tone({ freq: 980, dur: 0.09, type: 'sine', vol: 0.35 }); this._tone({ freq: 1470, dur: 0.16, type: 'sine', vol: 0.3, delay: 0.07 }); }
  hit()        { this._noise({ dur: 0.16, vol: 0.4, freq: 300 }); this._tone({ freq: 180, end: 90, dur: 0.18, type: 'square', vol: 0.25 }); }
  checkpoint() { [523, 659, 784].forEach((f, i) => this._tone({ freq: f, dur: 0.14, type: 'triangle', vol: 0.3, delay: i * 0.09 })); }
  finish()     { [523, 659, 784, 1046].forEach((f, i) => this._tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.35, delay: i * 0.13 })); }
  fall()       { this._tone({ freq: 500, end: 140, dur: 0.5, type: 'sine', vol: 0.3 }); }
}

export const audio = new AudioBus();
