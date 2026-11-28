import { describe, expect, it } from 'vitest'
import { draftToInput, emptyDraft } from './draft.ts'

describe('draftToInput', () => {
  it('rejects paint text over the field limits', () => {
    const draft = emptyDraft()
    draft.label = 'a'.repeat(120)
    expect(draftToInput(draft).ok).toBe(true)
    draft.label = 'a'.repeat(121)
    expect(draftToInput(draft)).toEqual({ ok: false, error: 'Label must be 120 characters or fewer.' })
    draft.label = ''
    draft.notes = 'a'.repeat(2001)
    expect(draftToInput(draft)).toEqual({ ok: false, error: 'Notes must be 2000 characters or fewer.' })
    draft.notes = ''
    draft.manufacturer = 'a'.repeat(121)
    expect(draftToInput(draft).ok).toBe(false)
  })
})
