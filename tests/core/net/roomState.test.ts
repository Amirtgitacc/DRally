import { describe, it, expect } from 'vitest'
import {
  createRoom, joinRoom, leaveRoom, setCar, setTrack, setReady, toSnapshot, allReady, addAi, removeAi, rematch,
} from '../../../src/core/net/roomState'
import { ROSTER } from '../../../src/data/roster'
import { rivalChassisId } from '../../../src/core/progression/ladder'

const host = { id: 'p1', name: 'Nyx', carId: 'jackal' }

// deterministic picker: always the first unused roster driver
const firstUnused = (used: Set<string>) => ROSTER.find((d) => !used.has(d.id)) ?? null

describe('roomState', () => {
  it('creates a room whose creator is host and only player', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(room.hostId).toBe('p1')
    expect(room.trackId).toBe('test-circuit')
    expect(room.players.map((p) => p.id)).toEqual(['p1'])
    expect(room.players[0].ready).toBe(false)
  })

  it('joins additional players in order', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    const r = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'vandal' })
    expect(r.ok).toBe(true)
    if (r.ok) room = r.room
    expect(room.players.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('rejects a 5th human with ROOM_FULL', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    for (const id of ['p2', 'p3', 'p4']) {
      const r = joinRoom(room, { id, name: id, carId: 'jackal' })
      if (r.ok) room = r.room
    }
    const overflow = joinRoom(room, { id: 'p5', name: 'p5', carId: 'jackal' })
    expect(overflow).toEqual({ ok: false, error: 'ROOM_FULL' })
  })

  it('hands host to the next joiner when the host leaves', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    const r = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'vandal' })
    if (r.ok) room = r.room
    const after = leaveRoom(room, 'p1')
    expect(after).not.toBeNull()
    expect(after!.hostId).toBe('p2')
    expect(after!.players.map((p) => p.id)).toEqual(['p2'])
  })

  it('returns null when the last player leaves', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(leaveRoom(room, 'p1')).toBeNull()
  })

  it('updates a player car and ready flag without mutating input', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    const carred = setCar(room, 'p1', 'leviathan')
    expect(carred.players[0].carId).toBe('leviathan')
    expect(room.players[0].carId).toBe('jackal') // original unchanged
    const readied = setReady(carred, 'p1', true)
    expect(readied.players[0].ready).toBe(true)
    expect(allReady(readied)).toBe(true)
  })

  it('only the host may change the track', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    const r = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'vandal' })
    if (r.ok) room = r.room
    expect(setTrack(room, 'p2', 'dust-bowl')).toEqual({ ok: false, error: 'NOT_HOST' })
    const ok = setTrack(room, 'p1', 'dust-bowl')
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.room.trackId).toBe('dust-bowl')
  })

  it('changing a player car clears their ready flag', () => {
    const room = setReady(createRoom('TIGER-42', host, 'test-circuit'), 'p1', true)
    expect(setCar(room, 'p1', 'vandal').players[0].ready).toBe(false)
  })

  it('projects a JSON snapshot', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(toSnapshot(room)).toEqual({
      code: 'TIGER-42', hostId: 'p1', trackId: 'test-circuit',
      players: [{ id: 'p1', name: 'Nyx', carId: 'jackal', variantId: 'base', ready: false, isAi: false }],
    })
  })
})

describe('roomState variantId sanitization', () => {
  it('defaults a missing variantId to base', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(room.players[0].variantId).toBe('base')
  })

  it('passes through a valid variantId', () => {
    const room = createRoom('TIGER-42', { ...host, variantId: 'a' }, 'test-circuit')
    expect(room.players[0].variantId).toBe('a')
  })

  it('sanitizes an unknown variantId to base', () => {
    const room = createRoom('TIGER-42', { ...host, variantId: 'chartreuse' }, 'test-circuit')
    expect(room.players[0].variantId).toBe('base')
  })

  it('sanitizes a variantId that is valid for another car but not this one', () => {
    // anahita only ships a 'base' variant — 'a' is invalid for it specifically
    const room = createRoom('TIGER-42', { id: 'p1', name: 'Nyx', carId: 'anahita', variantId: 'a' }, 'test-circuit')
    expect(room.players[0].variantId).toBe('base')
  })

  it('joinRoom sanitizes the joiner variantId the same way', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    const r = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'vandal', variantId: 'nope' })
    expect(r.ok).toBe(true)
    if (r.ok) room = r.room
    expect(room.players[1].variantId).toBe('base')
  })

  it('changing car via setCar resets variantId to base', () => {
    let room = createRoom('TIGER-42', { ...host, variantId: 'a' }, 'test-circuit')
    room = setCar(room, 'p1', 'vandal')
    expect(room.players[0].variantId).toBe('base')
  })
})

describe('roomState AI fill', () => {
  it('addAi appends a ready AI for an unused driver with a truthful carId', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    const next = addAi(room, 'p1', firstUnused)
    expect(next.players).toHaveLength(2)
    const ai = next.players[1]
    const driver = ROSTER[0]
    expect(ai.id).toBe(`ai:${driver.id}`)
    expect(ai.name).toBe(driver.name)
    expect(ai.isAi).toBe(true)
    expect(ai.ready).toBe(true)
    // carId is the chassis the AI will actually drive (rank = ROSTER index + 1)
    expect(ai.carId).toBe(rivalChassisId(1))
    // placeholder only — buildNetworkRace re-assigns AI variants seed-derived at race start
    expect(ai.variantId).toBe('base')
  })

  it('addAi never picks the same driver twice', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    room = addAi(room, 'p1', firstUnused)
    room = addAi(room, 'p1', firstUnused)
    const aiIds = room.players.filter((p) => p.isAi).map((p) => p.id)
    expect(new Set(aiIds).size).toBe(aiIds.length)
    expect(aiIds).toEqual([`ai:${ROSTER[0].id}`, `ai:${ROSTER[1].id}`])
  })

  it('addAi is host-only and respects MAX_PLAYERS', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    expect(addAi(room, 'intruder', firstUnused).players).toHaveLength(1) // not host → no-op
    room = addAi(room, 'p1', firstUnused)
    room = addAi(room, 'p1', firstUnused)
    room = addAi(room, 'p1', firstUnused) // now 4 (1 human + 3 AI)
    const full = addAi(room, 'p1', firstUnused)
    expect(full.players).toHaveLength(4) // no 5th
  })

  it('addAi no-ops when the picker returns null (roster exhausted)', () => {
    const room = createRoom('TIGER-42', host, 'test-circuit')
    expect(addAi(room, 'p1', () => null).players).toHaveLength(1)
  })

  it('removeAi removes only AI, host-only', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    room = addAi(room, 'p1', firstUnused)
    const aiId = room.players[1].id
    expect(removeAi(room, 'intruder', aiId).players).toHaveLength(2) // not host → no-op
    expect(removeAi(room, 'p1', 'p1').players).toHaveLength(2) // can't remove a human
    expect(removeAi(room, 'p1', aiId).players).toHaveLength(1) // AI gone
  })

  it('leaveRoom hands host to the first remaining human, skipping AI', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit') // p1 host
    const j = joinRoom(room, { id: 'p2', name: 'Rook', carId: 'jackal' })
    if (j.ok) room = j.room
    room = addAi(room, 'p1', firstUnused) // AI sits at index 1, before p2
    const after = leaveRoom(room, 'p1')
    expect(after).not.toBeNull()
    expect(after!.hostId).toBe('p2') // not the AI at index 1
  })

  it('leaveRoom closes the room when the last human leaves even if AI remain', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    room = addAi(room, 'p1', firstUnused)
    expect(leaveRoom(room, 'p1')).toBeNull()
  })

  it('rematch (from results) clears human ready but keeps AI ready', () => {
    let room = createRoom('TIGER-42', host, 'test-circuit')
    room = setReady(room, 'p1', true)
    room = addAi(room, 'p1', firstUnused)
    room = { ...room, phase: 'results' } // rematch is only valid from a finished race
    const next = rematch(room)
    expect(next.phase).toBe('lobby')
    expect(next.players.find((p) => p.id === 'p1')!.ready).toBe(false)
    expect(next.players.find((p) => p.isAi)!.ready).toBe(true)
  })
})
