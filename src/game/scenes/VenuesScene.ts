import Phaser from 'phaser'
import { ALL_TRACKS, type TrackDef } from '../../data/tracks'
import { catmullRomClosed, closedPolylineLength } from '../../core/track/geometry'
import { drawTrackMap } from '../ui/trackMap'
import { C, TIER_COLOR, TIER_LABEL } from '../ui/theme'
import { text } from '../ui/widgets'
import { sceneBackground } from '../ui/sceneBackground'
import { card, carousel, screenTitle, backPlate, type CarouselHandle } from '../ui/mobile'
import { deferredImage, type DeferredImageHandle } from '../ui/deferredImage'
import { trackPosterTextureFor } from '../textures/loadedAssets'
import { loadCareer } from '../state/saveGame'
import { formatTime } from '../../core/race/format'

/** Scale from track px to something that reads as a distance. */
const PX_PER_MILE = 6000

// The venue art (portrait 2:3 poster) sells the place; the centerline-derived
// map on the right is the truth of what actually gets driven. Both live inside
// chamfered plates, chevrons in the gutters, a full-width info plate below.
const POSTER = { cx: 550, cy: 508, w: 760, h: 684 }
const MAP = { cx: 1350, cy: 508, w: 800, h: 684 }
const POSTER_BOX = { w: 700, h: 600 }
const MAP_DRAW = { cx: 1350, cy: 528, w: 700, h: 520 }
const INFO = { cx: 1118, cy: 980, w: 1476, h: 104 }

/** A gallery of every venue: the promo poster plus the layout you will drive. */
export class VenuesScene extends Phaser.Scene {
  private mapGfx!: Phaser.GameObjects.Graphics
  private poster!: DeferredImageHandle
  private info!: Phaser.GameObjects.Container
  private wheel!: CarouselHandle

  constructor() {
    super('Venues')
  }

  create() {
    sceneBackground(this, 'bg-race-ops', { veil: 0.52 })
    screenTitle(this, 'VENUES')

    // static plates — drawn once; only their contents change per venue
    card(this, POSTER.cx, POSTER.cy, POSTER.w, POSTER.h)
    card(this, MAP.cx, MAP.cy, MAP.w, MAP.h, 'CIRCUIT MAP')
    card(this, INFO.cx, INFO.cy, INFO.w, INFO.h)

    // poster streams in behind the map graphics; both sit above their plates
    const firstKey = trackPosterTextureFor(ALL_TRACKS[0].id) ?? '__WHITE'
    this.poster = deferredImage(this, POSTER.cx, POSTER.cy, firstKey, POSTER_BOX.w, POSTER_BOX.h)
    this.mapGfx = this.add.graphics()
    this.info = this.add.container(0, 0)

    // visible touch route back; scene keeps its own Esc handler below
    backPlate(this, 'SINGLE PLAYER', () => this.scene.start('Menu'), { y: INFO.cy })

    // chevrons + dots + swipe live in the carousel; it renders venue `i` for us
    this.wheel = carousel(this, ALL_TRACKS.length, (i) => this.render(i), {
      chevronY: POSTER.cy,
      dotsY: 884,
      startIndex: 0,
    })

    const kb = this.input.keyboard!
    const onLeft = () => this.wheel.prev()
    const onRight = () => this.wheel.next()
    const onEsc = () => this.scene.start('Menu')
    kb.on('keydown-LEFT', onLeft)
    kb.on('keydown-RIGHT', onRight)
    kb.on('keydown-ESC', onEsc)
    this.events.on('shutdown', () => {
      kb.off('keydown-LEFT', onLeft)
      kb.off('keydown-RIGHT', onRight)
      kb.off('keydown-ESC', onEsc)
    })
  }

  private lapDistance(track: TrackDef): number {
    const line = catmullRomClosed(track.controls, track.samplesPerSegment)
    return closedPolylineLength(line) / PX_PER_MILE
  }

  /** Diagonal hazard stripes in the tier colour — a non-colour-alone tier cue. */
  private hazardBar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, color: number) {
    const h = 12
    const step = 14
    g.fillStyle(C.surfaceSunken, 0.9)
    g.fillRect(cx - w / 2, cy - h / 2, w, h)
    for (let x = -w / 2; x < w / 2; x += step) {
      g.fillStyle(color, 0.9)
      g.beginPath()
      g.moveTo(cx + x, cy + h / 2)
      g.lineTo(cx + x + h, cy - h / 2)
      g.lineTo(cx + x + h + 6, cy - h / 2)
      g.lineTo(cx + x + 6, cy + h / 2)
      g.closePath()
      g.fillPath()
    }
    g.lineStyle(1, color, 0.7)
    g.strokeRect(cx - w / 2, cy - h / 2, w, h)
  }

  private render(i: number) {
    const track = ALL_TRACKS[i]
    const color = TIER_COLOR[track.tier]
    const record = loadCareer().records[track.id]

    // poster: swap the framed art; hide the image if a venue has no poster
    const posterKey = trackPosterTextureFor(track.id)
    if (posterKey) {
      this.poster.image.setVisible(true)
      this.poster.setKey(posterKey, POSTER_BOX.w, POSTER_BOX.h)
    } else {
      this.poster.image.setVisible(false)
    }

    // circuit map: the same centerline the race is built from, tier-coloured
    this.mapGfx.clear()
    drawTrackMap(this.mapGfx, track, {
      cx: MAP_DRAW.cx,
      cy: MAP_DRAW.cy,
      width: MAP_DRAW.w,
      height: MAP_DRAW.h,
      color,
      lineWidth: 6,
      showStart: true,
      showSurface: true,
    })

    // rebuild the bottom info plate contents for this venue
    this.info.removeAll(true)
    const g = this.add.graphics()
    this.info.add(g)

    const lap = this.lapDistance(track)
    const total = lap * track.laps
    const bestLap = record?.bestLapMs ? formatTime(record.bestLapMs) : null

    const y = INFO.cy
    // venue name — big, tier-coloured, sits to the right of the back plate
    this.info.add(text(this, 400, y, track.name, {
      size: 'heading', face: 'display', weight: 700, letterSpacing: 2,
      color, stroke: C.shadow, strokeThickness: 5, origin: [0, 0.5],
    }))

    // tier chip: label + hazard stripe (colour is never the only signal)
    const tierCx = 940
    this.info.add(text(this, tierCx, y - 16, `${TIER_LABEL[track.tier]} TIER`, {
      size: 'caption', face: 'display', weight: 600, letterSpacing: 2, color, origin: [0.5, 0.5],
    }))
    this.hazardBar(g, tierCx, y + 22, 128, color)

    // stat columns: value over label, mono figures, dividers between
    const cols: { cx: number; value: string; label: string; valueColor?: number }[] = [
      { cx: 1130, value: `${track.laps}`, label: 'LAPS' },
      { cx: 1330, value: `${lap.toFixed(2)} MI`, label: 'PER LAP' },
      { cx: 1530, value: `${total.toFixed(2)} MI`, label: 'TOTAL' },
      { cx: 1730, value: bestLap ?? 'NO TIME', label: 'BEST LAP', valueColor: bestLap ? C.money : C.textMuted },
    ]
    const dividers = [1035, 1230, 1430, 1630]
    g.lineStyle(1, C.line, 0.8)
    for (const dx of dividers) g.lineBetween(dx, y - 30, dx, y + 30)

    for (const col of cols) {
      this.info.add(text(this, col.cx, y - 16, col.value, {
        size: 'body', face: 'mono', weight: 700, color: col.valueColor ?? C.textPrimary, origin: [0.5, 0.5],
      }))
      this.info.add(text(this, col.cx, y + 20, col.label, {
        size: 'label', face: 'display', weight: 600, letterSpacing: 3, color: C.textMuted, origin: [0.5, 0.5],
      }))
    }
  }
}
