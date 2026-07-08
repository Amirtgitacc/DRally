import { defineConfig } from 'vitest/config'

export default defineConfig({
  // relative paths so the build runs from a subdirectory (itch.io, GitHub Pages)
  base: './',
  server: { port: 5199 },
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
