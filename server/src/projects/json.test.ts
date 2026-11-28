import { describe, expect, it } from 'vitest'
import type { Project, ProjectColor } from '../db/schema.js'
import { toProjectJson } from './json.js'

describe('toProjectJson', () => {
  it('returns numeric columns as numbers', () => {
    const project: Project = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      title: 'Lake',
      sourceFileId: null,
      colorCount: 8,
      paperPreset: 'A4',
      paperWidthMm: '210.000',
      paperHeightMm: '297',
      orientation: 'portrait',
      marginMm: '10',
      coverageRate: '0.020',
      cropX: '0.1000',
      cropY: '0.2000',
      cropWidth: '0.5000',
      cropHeight: '0.6000',
      constrainToOwned: true,
      status: 'draft',
      detail: 'balanced',
      analysisFileId: null,
      analysisKey: null,
      thumbnailFileId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }
    const color: ProjectColor = {
      id: '44444444-4444-4444-8444-444444444444',
      projectId: project.id,
      number: 1,
      hex: '#112233',
      paintId: null,
      areaCm2: '1.50',
      estimatedQuantity: '0.030',
      shortfall: false,
    }

    const json = toProjectJson(project, [color])
    expect(json.paperWidthMm).toBe(210)
    expect(json.paperHeightMm).toBe(297)
    expect(json.marginMm).toBe(10)
    expect(json.coverageRate).toBe(0.02)
    expect(json.cropX).toBe(0.1)
    expect(json.cropY).toBe(0.2)
    expect(json.cropWidth).toBe(0.5)
    expect(json.cropHeight).toBe(0.6)
    expect(json.colors[0]?.areaCm2).toBe(1.5)
    expect(json.colors[0]?.estimatedQuantity).toBe(0.03)
    expect(json.updatedAt).toBe('2026-01-02T00:00:00.000Z')
  })
})
