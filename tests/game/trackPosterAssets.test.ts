import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ALL_TRACKS } from '../../src/data/tracks'
import {
  LOADED_TEXTURES,
  LOADED_FX_TEXTURES,
  LOADED_HERO_TEXTURES,
  LOADED_TOP_TEXTURES,
  LOADED_SCREEN_TEXTURES,
  LOADED_TOP_VARIANT_TEXTURES,
  LOADED_MP_ONLY_TEXTURES,
  LOADED_POSTER_TEXTURES,
  LOADED_POSTER_VARIANT_TEXTURES,
  LOADED_TRACK_POSTER_TEXTURES,
  LOADED_ENVIRONMENT_TEXTURES,
  trackPosterTextureFor,
} from '../../src/game/textures/loadedAssets'
import { existsSync } from 'node:fs'
import { ALL_TRACKS as CATALOG } from '../../src/data/tracks'

/** Canvas dimensions from a WebP header (VP8 / VP8L / VP8X variants). */
function webpDimensions(buf: Buffer): { w: number; h: number } {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF')
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP')
  const fourcc = buf.toString('ascii', 12, 16)
  if (fourcc === 'VP8 ') {
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
  }
  if (fourcc === 'VP8L') {
    const bits = buf.readUInt32LE(21)
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (fourcc === 'VP8X') {
    return {
      w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
      h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
    }
  }
  throw new Error(`unrecognised WebP chunk: ${fourcc}`)
}

describe('track poster assets', () => {
  it('registers exactly one poster texture per venue', () => {
    for (const track of ALL_TRACKS) {
      const hits = LOADED_TRACK_POSTER_TEXTURES.filter((t) => t.key === `track-poster-${track.id}`)
      expect(hits, `missing/duplicate poster key for ${track.id}`).toHaveLength(1)
    }
    expect(LOADED_TRACK_POSTER_TEXTURES).toHaveLength(ALL_TRACKS.length)
  })

  it('resolves a poster key per venue and fails safely on retired ids', () => {
    for (const track of ALL_TRACKS) {
      expect(trackPosterTextureFor(track.id)).toBe(`track-poster-${track.id}`)
    }
    for (const id of ['dust-bowl', 'test-circuit', 'widows-coil', 'nope']) {
      expect(trackPosterTextureFor(id)).toBeNull()
    }
  })

  it('ships every registered poster file as portrait 2:3 art', () => {
    for (const t of LOADED_TRACK_POSTER_TEXTURES) {
      const file = resolve(__dirname, '../../public', t.url)
      const { w, h } = webpDimensions(readFileSync(file))
      expect(w, `${t.url} width`).toBeGreaterThan(0)
      expect(h * 2, `${t.url} must be portrait 2:3`).toBe(w * 3)
    }
  })

  it('keeps every loaded texture key unique across all registries', () => {
    const all = [
      ...LOADED_TEXTURES,
      ...LOADED_FX_TEXTURES,
      ...LOADED_HERO_TEXTURES,
      ...LOADED_TOP_TEXTURES,
      ...LOADED_SCREEN_TEXTURES,
      ...LOADED_TOP_VARIANT_TEXTURES,
      ...LOADED_MP_ONLY_TEXTURES,
      ...LOADED_POSTER_TEXTURES,
      ...LOADED_POSTER_VARIANT_TEXTURES,
      ...LOADED_TRACK_POSTER_TEXTURES,
      ...LOADED_ENVIRONMENT_TEXTURES,
    ].map((t) => t.key)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('environment set-piece assets', () => {
  it('ships every registered environment texture file', () => {
    for (const t of LOADED_ENVIRONMENT_TEXTURES) {
      expect(existsSync(resolve(__dirname, '../../public', t.url)), `${t.url} missing`).toBe(true)
    }
  })

  it('every set piece and decoration a track authors has a registered texture', () => {
    const keys = new Set(LOADED_ENVIRONMENT_TEXTURES.map((t) => t.key))
    for (const track of CATALOG) {
      for (const sp of [...(track.setPieces ?? []), ...(track.decorations ?? [])]) {
        expect(keys.has(sp.texture), `${track.id}: unregistered texture ${sp.texture}`).toBe(true)
      }
    }
  })

  it('never registers a retired obstacle/decor texture key', () => {
    const retired = [
      'set-container-cluster', 'set-crane-buffer', 'set-valve-manifold',
      'set-boulder-cluster', 'set-scrap-pile', 'set-cable-spool',
      'set-wreck', 'set-conveyor',
    ]
    const keys = new Set(LOADED_ENVIRONMENT_TEXTURES.map((t) => t.key))
    for (const key of retired) expect(keys.has(key), `${key} should be retired`).toBe(false)
  })

  it('keeps every authored collision circle inside its sprite footprint (+6px)', () => {
    const byKey = new Map(LOADED_ENVIRONMENT_TEXTURES.map((t) => [t.key, t.url]))
    for (const track of CATALOG) {
      for (const sp of (track.setPieces ?? []).filter((p) => !p.overhead && p.circles.length > 0)) {
        const { w, h } = webpDimensions(readFileSync(resolve(__dirname, '../../public', byKey.get(sp.texture)!)))
        const halfL = (w * sp.scale) / 2 // displayed half-length along the tangent
        const halfC = (h * sp.scale) / 2 // displayed half-width across it
        for (const c of sp.circles) {
          expect(Math.abs(c.fwd) + c.r, `${track.id}/${sp.texture}: circle overshoots sprite length`).toBeLessThanOrEqual(halfL + 6)
          expect(Math.abs(c.side) + c.r, `${track.id}/${sp.texture}: circle overshoots sprite width`).toBeLessThanOrEqual(halfC + 6)
        }
      }
    }
  })
})
