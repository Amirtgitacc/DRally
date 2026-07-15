import { type ClientMsg, type ServerMsg } from '../../core/net/protocol'
import { MP_SERVER_URL } from '../../config/net'

/** Thin typed WebSocket wrapper for the multiplayer lobby. Career-independent. */
export class NetClient {
  private ws: WebSocket | null = null
  private messageHandlers: Array<(msg: ServerMsg) => void> = []
  private closeHandlers: Array<() => void> = []

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  connect(url: string = MP_SERVER_URL): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      this.ws = ws
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('Could not reach the multiplayer server'))
      ws.onclose = () => this.closeHandlers.forEach((h) => h())
      ws.onmessage = (ev) => {
        let msg: ServerMsg
        try {
          msg = JSON.parse(String(ev.data)) as ServerMsg
        } catch {
          return
        }
        this.messageHandlers.forEach((h) => h(msg))
      }
    })
  }

  send(msg: ClientMsg): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg))
  }

  onMessage(fn: (msg: ServerMsg) => void): void {
    this.messageHandlers.push(fn)
  }

  onClose(fn: () => void): void {
    this.closeHandlers.push(fn)
  }

  offMessage(fn: (msg: ServerMsg) => void): void {
    this.messageHandlers = this.messageHandlers.filter((h) => h !== fn)
  }

  offClose(fn: () => void): void {
    this.closeHandlers = this.closeHandlers.filter((h) => h !== fn)
  }

  close(): void {
    this.messageHandlers = []
    this.closeHandlers = []
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
