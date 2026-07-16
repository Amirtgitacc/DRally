// scripts/mp-smoke.mjs — run against a live `npm run server`
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

let snaps = 0, started = false
host.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'raceStart') started = true; if (m.t === 'snapshot') snaps++ })
host.send(JSON.stringify({ t: 'start' }))
await new Promise((r) => setTimeout(r, 1500))
console.log(JSON.stringify({ started, snaps, ok: started && snaps > 20 }))
process.exit(started && snaps > 20 ? 0 : 1)
