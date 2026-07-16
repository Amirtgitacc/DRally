import { describe, it, expect } from 'vitest'
import { createRoom, setReady, joinRoom, startRace, endRace, rematch } from '../../src/core/net/roomState'

function room2() {
  let r = createRoom('TIGER-42', { id: 'h', name: 'Host', carId: 'jackal' }, 'test-circuit')
  r = (joinRoom(r, { id: 'g', name: 'Guest', carId: 'jackal' }) as any).room
  return r
}

describe('room lifecycle', () => {
  it('createRoom starts in lobby phase', () => {
    expect(createRoom('X-01', { id: 'h', name: 'H', carId: 'jackal' }, 'test-circuit').phase).toBe('lobby')
  })
  it('startRace requires host', () => {
    const r = room2()
    expect(startRace(r, 'g').ok).toBe(false)
  })
  it('startRace requires all ready and 2+ players', () => {
    let r = room2()
    expect(startRace(r, 'h').ok).toBe(false) // nobody ready
    r = setReady(setReady(r, 'h', true), 'g', true)
    const res = startRace(r, 'h')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.room.phase).toBe('racing')
  })
  it('rematch returns to lobby and clears ready', () => {
    let r = room2()
    r = setReady(setReady(r, 'h', true), 'g', true)
    r = (startRace(r, 'h') as any).room
    r = endRace(r)
    expect(r.phase).toBe('results')
    const back = rematch(r)
    expect(back.phase).toBe('lobby')
    expect(back.players.every((p) => !p.ready)).toBe(true)
  })
})
