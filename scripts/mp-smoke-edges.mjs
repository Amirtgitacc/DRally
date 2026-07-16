// scripts/mp-smoke-edges.mjs — run against a live `npm run server`
//
// Regression check for two Task 7 review fixes:
//  1. CRITICAL: a repeat `{t:'start'}` while a race is already live must be
//     rejected, not spawn a second RaceHost (which would leak a setInterval
//     and double the snapshot broadcast rate / raceStart count).
//  2. IMPORTANT: a malformed `{t:'input', command:{}}` frame must not reach
//     the sim tick — the server must keep ticking normally afterward instead
//     of throwing on every tick forever.
import WebSocket from 'ws'
const URL = 'ws://localhost:8080'
const open = (ws) => new Promise((r) => ws.on('open', r))
const next = (ws) => new Promise((r) => ws.once('message', (d) => r(JSON.parse(String(d)))))

const host = new WebSocket(URL); await open(host)
host.send(JSON.stringify({ t: 'create', name: 'Host', carId: 'jackal', trackId: 'test-circuit' }))
const joined = await next(host) // { t:'joined', youId, lobby }
const code = joined.lobby.code

const guest = new WebSocket(URL); await open(guest)
guest.send(JSON.stringify({ t: 'join', code, name: 'Guest', carId: 'jackal' }))
await next(guest)

host.send(JSON.stringify({ t: 'ready', ready: true }))
guest.send(JSON.stringify({ t: 'ready', ready: true }))
await new Promise((r) => setTimeout(r, 200))

let raceStarts = 0
let errorMsgs = 0
host.on('message', (d) => {
  const m = JSON.parse(String(d))
  if (m.t === 'raceStart') raceStarts++
  if (m.t === 'error') errorMsgs++
})
host.send(JSON.stringify({ t: 'start' }))
await new Promise((r) => setTimeout(r, 500)) // let the race actually start ticking

// (1) repeat start from the host while the race is already live — must be rejected
host.send(JSON.stringify({ t: 'start' }))
// (2) malformed input frame from a client — must be ignored, not crash the tick
guest.send(JSON.stringify({ t: 'input', command: {} }))

await new Promise((r) => setTimeout(r, 500))

// Count snapshots in a clean follow-up window, after the two bad frames above.
// A single live host at 30 Hz delivers ~25-35 snapshots/sec; a leaked second
// host (fix 1 failing) would roughly double that; a spinning/dead tick loop
// (fix 2 failing) would deliver far fewer or none.
let snapsAfter = 0
const afterHandler = (d) => { const m = JSON.parse(String(d)); if (m.t === 'snapshot') snapsAfter++ }
host.on('message', afterHandler)
await new Promise((r) => setTimeout(r, 1000))
host.off('message', afterHandler)

const singleHostRate = snapsAfter >= 20 && snapsAfter <= 40
const noDoubleStart = raceStarts === 1
const repeatStartRejected = errorMsgs >= 1
const serverAlive = host.readyState === WebSocket.OPEN && guest.readyState === WebSocket.OPEN

const ok = singleHostRate && noDoubleStart && repeatStartRejected && serverAlive
console.log(JSON.stringify({ raceStarts, snapsAfter, errorMsgs, singleHostRate, noDoubleStart, repeatStartRejected, serverAlive, ok }))
host.close()
guest.close()
process.exit(ok ? 0 : 1)
