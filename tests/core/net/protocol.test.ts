import { describe, it, expect } from 'vitest'
import { MAX_PLAYERS, type ClientMsg, type ServerMsg } from '../../../src/core/net/protocol'

describe('protocol', () => {
  it('caps a room at 4 humans', () => {
    expect(MAX_PLAYERS).toBe(4)
  })

  it('round-trips a client message through JSON unchanged', () => {
    const msg: ClientMsg = { t: 'join', code: 'TIGER-42', name: 'Nyx', carId: 'jackal' }
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg)
  })

  it('round-trips a server lobby snapshot through JSON unchanged', () => {
    const msg: ServerMsg = {
      t: 'lobby',
      lobby: {
        code: 'TIGER-42', hostId: 'p1', trackId: 'test-circuit',
        players: [{ id: 'p1', name: 'Nyx', carId: 'jackal', ready: false, isAi: false }],
      },
    }
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg)
  })

  it('input carries a seq and snapshot carries per-player acks', () => {
    const input: ClientMsg = {
      t: 'input', seq: 7,
      command: { input: { throttle: 1, brake: 0, steer: 0, handbrake: false }, fire: false, turbo: false, dropMine: false },
    }
    expect(input.t === 'input' && input.seq).toBe(7)

    const snap: ServerMsg = { t: 'snapshot', snap: {} as any, events: [], acks: { a: 3, b: 5 } }
    expect(snap.t === 'snapshot' && snap.acks.a).toBe(3)
  })
})
