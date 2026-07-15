/** WebSocket URL of the multiplayer lobby server. Override in prod via VITE_MP_SERVER. */
export const MP_SERVER_URL: string =
  (import.meta.env.VITE_MP_SERVER as string | undefined) ?? 'ws://localhost:8080'
