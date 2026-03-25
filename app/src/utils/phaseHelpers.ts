import type { Phase, TaskStatus } from '../types'

export function phaseStatus(phase: Phase): TaskStatus {
  const t = phase.tasks
  if (t.length === 0) return 'pending'
  if (t.every((x) => x.status === 'done')) return 'done'
  if (t.some((x) => x.status === 'failed')) return 'failed'
  if (t.some((x) => x.status === 'wip')) return 'wip'
  return 'pending'
}

export function phaseProgress(phase: Phase): { done: number; total: number; pct: number } {
  const total = phase.tasks.length
  const done = phase.tasks.filter((t) => t.status === 'done').length
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}
