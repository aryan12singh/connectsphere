import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { availabilityLine } = require('../../services/equipment-service/src/domain/equipment-availability') as {
  availabilityLine: (total: number, requested: number, commitments: Array<Record<string, unknown>>, startAt: string, endAt: string) => { requested: number, available: number, shortfall: number }
}

describe('CS-42 — reservation period boundaries', () => {
  it('TC-CS42-05 permits a new reservation to start when the existing reservation ends', () => {
    const result = availabilityLine(5, 3, [
      { quantity: 2, startAt: '2026-11-12T11:00:00.000Z', endAt: '2026-11-12T12:45:00.000Z' },
    ], '2026-11-12T12:45:00.000Z', '2026-11-12T14:00:00.000Z')

    expect(result).toEqual({ requested: 3, available: 5, shortfall: 0 })
  })
})
