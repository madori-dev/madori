import { describe, expect, it } from 'vitest'
import { requiredUnsupportedPublicFormFields } from '@/lib/forms/public-fields'

describe('public form field policy', () => {
  it('rejects required CP-only fields but permits optional omission', () => {
    const result = requiredUnsupportedPublicFormFields({ tabs: { main: { fields: [
      { handle: 'email', field: { type: 'text', required: true } },
      { handle: 'related', field: { type: 'entries', required: true } },
      { handle: 'internal_asset', field: { type: 'asset', required: false } },
    ] } } })
    expect(result).toEqual(['related'])
  })
})
