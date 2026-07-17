import { describe, it, expect } from 'vitest'
import {
  createRoom, joinRoom, leaveRoom, setCar, setTrack, setReady, toSnapshot, allReady,
} from '../../../src/core/net/roomState'

const host = { id: 'p1', name: 'Nyx', carId: 'jackal' }

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
      players: [{ id: 'p1', name: 'Nyx', carId: 'jackal', ready: false, isAi: false }],
    })
  })
})
