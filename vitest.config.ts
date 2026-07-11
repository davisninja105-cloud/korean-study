import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'node',
    // E2E-01: Vitest's default include glob would otherwise also pick up
    // e2e/*.spec.ts (Playwright's suite) — keep discovery isolated.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
