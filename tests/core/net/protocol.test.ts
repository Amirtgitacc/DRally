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
        players: [{ id: 'p1', name: 'Nyx', carId: 'jackal', ready: false }],
      },
    }
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg)
  })
})
