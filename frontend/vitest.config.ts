import { defineVitestConfig } from '@nuxt/test-utils/config'
import { fileURLToPath } from 'node:url'

export default defineVitestConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'nuxt',
    include: ['frontend/tests/**/*.{test,spec}.{ts,js}', 'tests/specs/**/*.{test,spec}.{ts,js}'],
    coverage: {
      provider: 'v8',
      include: ['frontend/app/**/*.{ts,vue}', 'frontend/server/**/*.{ts,js}', 'frontend/lib/**/*.ts'],
      exclude: ['**/*.d.ts', 'frontend/app/components/ui/**'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: process.env.CS_COVERAGE_DIR || '../coverage/frontend',
    },
  },
})
