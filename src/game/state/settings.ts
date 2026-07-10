import { DEFAULT_BINDINGS, normalizeBindings } from '../input/bindings'
import type { SerializedBindings } from '../input/inputTypes'

export const SETTINGS_KEY = 'deathrally-settings-v1'

export interface SettingsState {
  masterVolume: number
  musicVolume: number
  effectsVolume: number
  muted: boolean
  bindings: SerializedBindings
  reducedShake: boolean
  reducedFlash: boolean
  toggleTurbo: boolean
  toggleFire: boolean
}

export const DEFAULT_SETTINGS: SettingsState = {
  masterVolume: 0.7,
  musicVolume: 0.55,
  effectsVolume: 0.8,
  muted: false,
  bindings: normalizeBindings(DEFAULT_BINDINGS),
  reducedShake: false,
  reducedFlash: false,
  toggleTurbo: false,
  toggleFire: false,
}

const volume = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback

export function normalizeSettings(value: unknown): SettingsState {
  const data = typeof value === 'object' && value !== null ? (value as Partial<SettingsState>) : {}
  return {
    masterVolume: volume(data.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: volume(data.musicVolume, DEFAULT_SETTINGS.musicVolume),
    effectsVolume: volume(data.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
    muted: data.muted === true,
    bindings: normalizeBindings(data.bindings),
    reducedShake: data.reducedShake === true,
    reducedFlash: data.reducedFlash === true,
    toggleTurbo: data.toggleTurbo === true,
    toggleFire: data.toggleFire === true,
  }
}

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? normalizeSettings(JSON.parse(raw)) : normalizeSettings(DEFAULT_SETTINGS)
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings: SettingsState) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)))
  } catch {
    // Settings remain usable for this scene even when storage is unavailable.
  }
}

export function resetSettings(): SettingsState {
  const settings = normalizeSettings(DEFAULT_SETTINGS)
  saveSettings(settings)
  return settings
}
