import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PhaseStepper from '../components/autopilot/PhaseStepper'
import type { AutopilotPhase } from '../types'

const phases: AutopilotPhase[] = [
  { name: 'Business Analysis', status: 'completed', duration_s: 29, cost: 0.72, artifact: 'REQUIREMENTS.md' },
  { name: 'Architecture Plan', status: 'completed', duration_s: 10, cost: 4.73, artifact: 'PLAN.md' },
  { name: 'Team Review', status: 'completed', duration_s: 1381, cost: 12.54, artifact: 'TEAM_REVIEW.md' },
  { name: 'Implementation (TDD)', status: 'running', duration_s: 1198, cost: null, artifact: null },
  { name: 'Static Analysis', status: 'pending', duration_s: null, cost: null, artifact: null },
]

describe('PhaseStepper', () => {
  describe('full mode', () => {
    it('does not render artifact chips inline — artifacts belong in the Documents section', () => {
      render(<PhaseStepper phases={phases} mode="full" />)

      // Phase names should be visible
      expect(screen.getByText('Business Analysis')).toBeInTheDocument()
      expect(screen.getByText('Team Review')).toBeInTheDocument()

      // Artifact filenames should NOT appear as chips in the stepper
      expect(screen.queryByText('REQUIREMENTS.md')).not.toBeInTheDocument()
      expect(screen.queryByText('PLAN.md')).not.toBeInTheDocument()
      expect(screen.queryByText('TEAM_REVIEW.md')).not.toBeInTheDocument()
    })

    it('renders duration and cost on one line per phase', () => {
      render(<PhaseStepper phases={phases} mode="full" />)

      expect(screen.getByText('29s · $0.72')).toBeInTheDocument()
      expect(screen.getByText('10s · $4.73')).toBeInTheDocument()
    })

    it('renders total row with aggregated values', () => {
      render(<PhaseStepper phases={phases} mode="full" />)

      expect(screen.getByText('Total')).toBeInTheDocument()
    })
  })

  describe('compact mode', () => {
    it('renders phase names with status prefixes', () => {
      render(<PhaseStepper phases={phases} mode="compact" />)

      expect(screen.getByText(/Business Analysis/)).toBeInTheDocument()
      expect(screen.getByText(/Implementation/)).toBeInTheDocument()
    })
  })
})
