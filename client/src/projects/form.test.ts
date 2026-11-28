import { describe, expect, it } from 'vitest'
import { COVERAGE_ML_PER_CM2 } from '../processing/defaults.ts'
import type { ProjectJson } from './api.ts'
import { formFromProject, initialForm, parseFormSettings } from './form.ts'

describe('parseFormSettings', () => {
  it('orients a preset and a custom size', () => {
    const landscapePreset = parseFormSettings({ ...initialForm, orientation: 'landscape' })
    expect(landscapePreset.ok).toBe(true)
    if (!landscapePreset.ok) return
    expect(landscapePreset.value.paperWidthMm).toBe(297)
    expect(landscapePreset.value.paperHeightMm).toBe(210)
    expect(landscapePreset.value.coverageRate).toBe(COVERAGE_ML_PER_CM2)

    const custom = parseFormSettings({
      ...initialForm,
      paperPreset: 'custom',
      orientation: 'landscape',
      customWidth: '100',
      customHeight: '200',
    })
    expect(custom.ok).toBe(true)
    if (!custom.ok) return
    expect(custom.value.paperWidthMm).toBe(200)
    expect(custom.value.paperHeightMm).toBe(100)
  })

  it('accepts a color count from 6 to 48', () => {
    expect(parseFormSettings({ ...initialForm, colorCount: 6 }).ok).toBe(true)
    expect(parseFormSettings({ ...initialForm, colorCount: 20 }).ok).toBe(true)
    expect(parseFormSettings({ ...initialForm, colorCount: 48 }).ok).toBe(true)
    expect(parseFormSettings({ ...initialForm, colorCount: 5 }).ok).toBe(false)
    expect(parseFormSettings({ ...initialForm, colorCount: 49 }).ok).toBe(false)
  })

  it('loads a custom paper height from the saved project', () => {
    const project: ProjectJson = {
      id: 'p',
      title: 'Board',
      sourceFileId: null,
      colorCount: 12,
      paperPreset: 'custom',
      paperWidthMm: 180,
      paperHeightMm: 240,
      orientation: 'portrait',
      marginMm: 10,
      coverageRate: null,
      cropX: null,
      cropY: null,
      cropWidth: null,
      cropHeight: null,
      constrainToOwned: false,
      createdAt: '',
      updatedAt: '',
      colors: [],
    }
    const form = formFromProject(project)
    expect(form.customWidth).toBe('180')
    expect(form.customHeight).toBe('240')
  })
})
