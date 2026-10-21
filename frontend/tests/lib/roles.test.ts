import { describe, expect, it } from 'vitest'
import { roleHome } from '../../lib/roles'

describe('roleHome', () => {
  it('sends Technical Support staff directly to the technical requirements review queue', () => {
    expect(roleHome('TECHNICAL_SUPPORT_STAFF')).toBe('/technical-requirements')
  })
})
