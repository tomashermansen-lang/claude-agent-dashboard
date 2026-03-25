import { describe, it, expect } from 'vitest'
import { phaseStatus, phaseProgress } from '../utils/phaseHelpers'
import type { Phase } from '../types'

function phase(statuses: string[]): Phase {
  return {
    id: 'test',
    name: 'Test Phase',
    tasks: statuses.map((s, i) => ({ id: `t${i}`, name: `Task ${i}`, status: s as Phase['tasks'][0]['status'] })),
  }
}

describe('phaseStatus', () => {
  it('returns pending for empty phase', () => {
    expect(phaseStatus({ id: 'x', name: 'x', tasks: [] })).toBe('pending')
  })

  it('returns done when all tasks done', () => {
    expect(phaseStatus(phase(['done', 'done', 'done']))).toBe('done')
  })

  it('returns failed when any task failed', () => {
    expect(phaseStatus(phase(['done', 'failed', 'pending']))).toBe('failed')
  })

  it('returns wip when any task wip', () => {
    expect(phaseStatus(phase(['done', 'wip', 'pending']))).toBe('wip')
  })

  it('returns pending when all pending', () => {
    expect(phaseStatus(phase(['pending', 'pending']))).toBe('pending')
  })
})

describe('phaseProgress', () => {
  it('returns zero for empty phase', () => {
    const result = phaseProgress({ id: 'x', name: 'x', tasks: [] })
    expect(result).toEqual({ done: 0, total: 0, pct: 0 })
  })

  it('computes correct progress', () => {
    const result = phaseProgress(phase(['done', 'done', 'pending', 'wip']))
    expect(result.done).toBe(2)
    expect(result.total).toBe(4)
    expect(result.pct).toBe(50)
  })

  it('returns 100% when all done', () => {
    const result = phaseProgress(phase(['done', 'done']))
    expect(result.pct).toBe(100)
  })
})
