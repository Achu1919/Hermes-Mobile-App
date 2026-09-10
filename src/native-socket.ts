import PluginWebSocket, { type Message as PluginMessage } from '@tauri-apps/plugin-websocket'

/**
 * DOM-WebSocket-shaped adapter over Tauri's native WebSocket plugin.
 *
 * Why: the phone's WebView dials WebSocket upgrades with an `Origin:
 * http://tauri.localhost` header, which the dashboard's WS Host/Origin guard
 * refuses (403) — it trusts credentialed native clients, browser-shaped
 * origins from unknown apps less. The plugin dials from native Rust instead,
 * sending no Origin header at all, which the gateway accepts.
 */
export class NativeGatewaySocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = NativeGatewaySocket.CONNECTING
  onopen: (() => void) | null = null
  onerror: ((reason?: string) => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  connectError = ''

  private socket: PluginWebSocket | null = null

  constructor(url: string) {
    PluginWebSocket.connect(url)
      .then(socket => {
        // close() may win the race against a slow dial; never surface a dead socket.
        if (this.readyState === NativeGatewaySocket.CLOSED) {
          void socket.disconnect()
          return
        }
        this.socket = socket
        this.readyState = NativeGatewaySocket.OPEN
        this.onopen?.()
        socket.addListener((message: PluginMessage) => {
          if (message.type === 'Text') this.onmessage?.({ data: message.data })
          else if (message.type === 'Close') {
            this.readyState = NativeGatewaySocket.CLOSED
            this.onclose?.()
          }
        })
      })
      .catch(reason => {
        this.connectError = reason instanceof Error ? reason.message : String(reason)
        this.readyState = NativeGatewaySocket.CLOSED
        this.onerror?.(this.connectError)
        this.onclose?.()
      })
  }

  send(data: string): void {
    void this.socket?.send(data)
  }

  close(): void {
    if (this.readyState === NativeGatewaySocket.CLOSED) return
    this.readyState = NativeGatewaySocket.CLOSED
    const socket = this.socket
    if (socket) void socket.disconnect()
    this.onclose?.()
  }
}
