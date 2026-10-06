import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  root: new URL('..', import.meta.url).pathname,
  test: {
    environment: 'nuxt',
    include: ['frontend/tests/**/*.{test,spec}.{ts,js}', 'tests/specs/**/*.{test,spec}.{ts,js}'],
  },
})
