// Synthesized audio via WebAudio — no asset files, tuned quiet. Every sound
// is a hook point: swap these one-liners for real samples later without
// touching game code. Unlocks on first user gesture (browser autoplay rules).

import type { SettingsState } from '../state/settings'

const SYNTH_VOLUME = 0.5

class AudioBus {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private engineOsc: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  muted = false
  private volume = 0.7
  private effectsVolume = 0.8

  /** Call from a user-gesture handler (keydown) before any playback. */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    try {
      this.ctx = new AudioContext()
    } catch {
      return // no audio support — every method below becomes a no-op
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : this.volume * this.effectsVolume * SYNTH_VOLUME
    this.master.connect(this.ctx.destination)

    const len = this.ctx.sampleRate
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * this.effectsVolume * SYNTH_VOLUME
    return this.muted
  }

  applySettings(settings: Pick<SettingsState, 'masterVolume' | 'effectsVolume' | 'muted'>) {
    this.volume = settings.masterVolume
    this.effectsVolume = settings.effectsVolume
    this.muted = settings.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * this.effectsVolume * SYNTH_VOLUME
  }

  private noiseBurst(duration: number, filterType: BiquadFilterType, freqFrom: number, freqTo: number, gain: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = this.ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.setValueAtTime(freqFrom, this.ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), this.ctx.currentTime + duration)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration)
    src.connect(filter).connect(g).connect(this.master)
    src.start()
    src.stop(this.ctx.currentTime + duration)
  }

  private blip(freqFrom: number, freqTo: number, duration: number, type: OscillatorType, gain: number) {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freqFrom, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), this.ctx.currentTime + duration)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration)
    osc.connect(g).connect(this.master)
    osc.start()
    osc.stop(this.ctx.currentTime + duration)
  }

  /** volume 0..1, scaled by distance at the call site */
  shot(volume = 1) {
    this.noiseBurst(0.07, 'highpass', 900, 2500, 0.5 * volume)
  }

  explosion() {
    this.noiseBurst(0.8, 'lowpass', 900, 70, 1.0)
    this.blip(90, 30, 0.5, 'sine', 0.6)
  }

  /** A car coming back down onto its suspension. */
  thud() {
    this.noiseBurst(0.16, 'lowpass', 400, 60, 0.55)
    this.blip(70, 40, 0.14, 'sine', 0.35)
  }

  pickup(good: boolean) {
    if (good) {
      this.blip(660, 990, 0.09, 'square', 0.18)
    } else {
      this.blip(260, 90, 0.4, 'sawtooth', 0.25) // ominous trap sting
    }
  }

  countdownBeep(go: boolean) {
    this.blip(go ? 880 : 440, go ? 880 : 440, go ? 0.28 : 0.12, 'square', 0.2)
  }

  engineStart() {
    if (!this.ctx || !this.master || this.engineOsc) return
    this.engineOsc = this.ctx.createOscillator()
    this.engineOsc.type = 'sawtooth'
    this.engineOsc.frequency.value = 55
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    this.engineGain = this.ctx.createGain()
    this.engineGain.gain.value = 0
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master)
    this.engineOsc.start()
  }

  /** rpm 0..1 from speed ratio */
  setEngine(rpm: number, turbo: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return
    const target = 52 + rpm * 105 + (turbo ? 35 : 0)
    this.engineOsc.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.08)
    this.engineGain.gain.setTargetAtTime(0.05 + rpm * 0.03, this.ctx.currentTime, 0.1)
  }

  engineStop() {
    if (this.engineOsc) {
      this.engineOsc.stop()
      this.engineOsc.disconnect()
      this.engineOsc = null
      this.engineGain = null
    }
  }
}

export const audioBus = new AudioBus()
