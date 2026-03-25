import { describe, it, expect } from 'vitest'
import type { StreamEvent } from '../hooks/useAutopilotStream'

describe('StreamEvent orchestrator type', () => {
  it('accepts orchestrator events with msg field', () => {
    const event: StreamEvent = {
      type: 'orchestrator',
      msg: '✓ Static Analysis artifact found',
      ts: '2026-03-22T10:00:00Z',
    }
    expect(event.type).toBe('orchestrator')
    expect(event.msg).toContain('Static Analysis')
  })

  it('orchestrator events are distinct from phase events', () => {
    const orchestratorEvent: StreamEvent = {
      type: 'orchestrator',
      msg: 'Phase completed in 45s',
    }
    const phaseEvent: StreamEvent = {
      type: 'phase',
      phase: 'Static Analysis',
      status: 'completed',
      duration_s: 45,
    }
    expect(orchestratorEvent.type).not.toBe(phaseEvent.type)
  })
})
