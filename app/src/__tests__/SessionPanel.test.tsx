import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../theme'
import SessionPanel from '../components/SessionPanel'
import type { Task, AutopilotSession, AutopilotPhase } from '../types'

const completedPhases: AutopilotPhase[] = [
  { name: 'BA', status: 'completed', duration_s: 30, cost: 0.52, artifact: 'REQUIREMENTS.md' },
  { name: 'Plan', status: 'completed', duration_s: 60, cost: 1.20, artifact: 'PLAN.md' },
  { name: 'Implement', status: 'completed', duration_s: 120, cost: 3.00, artifact: null },
]

const runningPhases: AutopilotPhase[] = [
  { name: 'BA', status: 'completed', duration_s: 30, cost: 0.52, artifact: 'REQUIREMENTS.md' },
  { name: 'Plan', status: 'running', duration_s: null, cost: null, artifact: null },
]

const mockTask: Task = {
  id: 'my-feature',
  name: 'My Feature',
  status: 'done',
  description: 'A test feature',
  acceptance: ['When X happens, Y shall occur', 'When A, B shall C'],
  prompt: '/start my-feature',
  depends: ['dep-a', 'dep-b'],
}

const pendingTask: Task = {
  id: 'new-feature',
  name: 'New Feature',
  status: 'pending',
  autopilot: true,
  prompt: '/start new-feature',
  depends: [],
}

const completedSession: AutopilotSession = {
  task: 'my-feature',
  project: 'OIH',
  branch: 'feature/my-feature',
  status: 'completed',
  phases: completedPhases,
  elapsed_s: 210,
  cost: 4.72,
  log_path: null,
}

const runningSession: AutopilotSession = {
  task: 'my-feature',
  project: 'OIH',
  branch: 'feature/my-feature',
  status: 'running',
  phases: runningPhases,
  elapsed_s: 30,
  cost: 0.52,
  log_path: null,
}

function renderPanel(props: Partial<React.ComponentProps<typeof SessionPanel>> & { onSelectTask?: (id: string) => void; previousGate?: { name: string; passed: boolean } } = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <SessionPanel
        task={props.task ?? null}
        autopilotSession={props.autopilotSession ?? null}
        projectPath={props.projectPath ?? null}
        allTasks={props.allTasks}
        onClose={props.onClose}
        onSelectTask={props.onSelectTask}
        previousGate={props.previousGate}
      />
    </ThemeProvider>,
  )
}

describe('SessionPanel', () => {
  /* ═══ Empty state ═══ */
  it('shows placeholder when both task and session are null', () => {
    renderPanel()
    expect(screen.getByText(/select a task/i)).toBeInTheDocument()
  })

  /* ═══ Task-only (no autopilot) ═══ */
  describe('task-only rendering', () => {
    it('shows task name and completed chip for done tasks', () => {
      renderPanel({ task: mockTask })
      expect(screen.getByText('My Feature')).toBeInTheDocument()
      expect(screen.getByText('completed')).toBeInTheDocument()
    })

    it('shows acceptance criteria', () => {
      renderPanel({ task: mockTask })
      expect(screen.getByText('When X happens, Y shall occur')).toBeInTheDocument()
      expect(screen.getByText('When A, B shall C')).toBeInTheDocument()
    })

    it('shows dependencies in sidebar', () => {
      renderPanel({ task: mockTask })
      expect(screen.getByText('dep-a')).toBeInTheDocument()
      expect(screen.getByText('dep-b')).toBeInTheDocument()
      expect(screen.getByText('Depends on')).toBeInTheDocument()
    })

    it('shows dependents (tasks that depend on this task)', () => {
      const allTasks = new Map<string, Task>([
        ['my-feature', mockTask],
        ['child-task', { id: 'child-task', name: 'Child Task', status: 'pending', depends: ['my-feature'] }],
      ])
      renderPanel({ task: mockTask, allTasks })
      expect(screen.getByText('Required by')).toBeInTheDocument()
      expect(screen.getByText('child-task')).toBeInTheDocument()
    })

    it('shows previous phase gate when provided', () => {
      const taskWithNoDeps: Task = {
        id: 'first-in-phase',
        name: 'First Task',
        status: 'pending',
        depends: [],
      }
      renderPanel({ task: taskWithNoDeps, previousGate: { name: 'Setup Gate', passed: true } })
      expect(screen.getByText('After gate')).toBeInTheDocument()
      expect(screen.getByText('Setup Gate')).toBeInTheDocument()
    })

    it('does not show gate section when no previousGate provided', () => {
      renderPanel({ task: mockTask })
      expect(screen.queryByText('After gate')).not.toBeInTheDocument()
    })

    it('clicking a dependency calls onSelectTask', async () => {
      const onSelectTask = vi.fn()
      const allTasks = new Map<string, Task>([
        ['my-feature', mockTask],
        ['dep-a', { id: 'dep-a', name: 'Dep A', status: 'done' }],
        ['dep-b', { id: 'dep-b', name: 'Dep B', status: 'done' }],
      ])
      renderPanel({ task: mockTask, allTasks, onSelectTask })
      await userEvent.click(screen.getByText('dep-a'))
      expect(onSelectTask).toHaveBeenCalledWith('dep-a')
    })

    it('shows prompt for pending tasks', () => {
      renderPanel({ task: pendingTask, projectPath: '/tmp/test' })
      expect(screen.getByText('/start new-feature')).toBeInTheDocument()
    })

    it('hides prompt for done tasks', () => {
      renderPanel({ task: mockTask })
      expect(screen.queryByText('/start my-feature')).not.toBeInTheDocument()
    })

    it('always shows sidebar even without autopilot session', () => {
      renderPanel({ task: mockTask })
      // Sidebar should exist (Documents section rendered in sidebar)
      expect(screen.getByText('Acceptance Criteria')).toBeInTheDocument()
    })
  })

  /* ═══ Status chip consistency ═══ */
  describe('status chips', () => {
    it('shows "completed" not "done" for done tasks', () => {
      renderPanel({ task: mockTask })
      expect(screen.getByText('completed')).toBeInTheDocument()
      expect(screen.queryByText('done')).not.toBeInTheDocument()
    })

    it('shows "pending" for pending tasks', () => {
      renderPanel({ task: pendingTask })
      expect(screen.getByText('pending')).toBeInTheDocument()
    })

    it('shows autopilot badge when task has autopilot flag and session exists', () => {
      const autopilotTask = { ...mockTask, autopilot: true }
      renderPanel({ task: autopilotTask, autopilotSession: completedSession })
      expect(screen.getByText('autopilot')).toBeInTheDocument()
    })
  })

  /* ═══ Launch Autopilot ═══ */
  describe('launch autopilot', () => {
    it('shows launch button next to prompt for pending autopilot task', () => {
      renderPanel({ task: pendingTask, projectPath: '/tmp/test', allTasks: new Map() })
      expect(screen.getByRole('button', { name: /launch autopilot/i })).toBeInTheDocument()
      // Should be in the prompt bar area
      expect(screen.getByText('/start new-feature')).toBeInTheDocument()
    })

    it('hides launch button for done tasks', () => {
      renderPanel({ task: { ...mockTask, autopilot: true }, projectPath: '/tmp/test', allTasks: new Map() })
      expect(screen.queryByRole('button', { name: /launch autopilot/i })).not.toBeInTheDocument()
    })
  })

  /* ═══ With autopilot session ═══ */
  describe('with autopilot session', () => {
    it('shows phase stepper when session exists', () => {
      renderPanel({ task: mockTask, autopilotSession: completedSession })
      expect(screen.getByText('BA')).toBeInTheDocument()
      expect(screen.getByText('Plan')).toBeInTheDocument()
      expect(screen.getByText('Implement')).toBeInTheDocument()
    })

    it('shows total cost and duration', () => {
      renderPanel({ task: mockTask, autopilotSession: completedSession })
      expect(screen.getByText('Total')).toBeInTheDocument()
      expect(screen.getByText('$4.72')).toBeInTheDocument()
    })

    it('shows Session History chip for completed sessions', () => {
      renderPanel({ task: mockTask, autopilotSession: completedSession })
      expect(screen.getAllByText('Session History').length).toBeGreaterThan(0)
    })

    it('does not show Session History chip for running sessions', () => {
      renderPanel({ task: mockTask, autopilotSession: runningSession })
      expect(screen.queryByText('Session History')).not.toBeInTheDocument()
    })
  })

  /* ═══ Close button ═══ */
  describe('close button', () => {
    it('calls onClose when close button clicked', async () => {
      const onClose = vi.fn()
      renderPanel({ task: mockTask, onClose })
      await userEvent.click(screen.getByLabelText('Close panel'))
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose on Escape key', async () => {
      const onClose = vi.fn()
      renderPanel({ task: mockTask, onClose })
      await userEvent.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalled()
    })
  })

  /* ═══ Session-only (orphan autopilot, no plan task) ═══ */
  describe('session-only rendering', () => {
    it('shows session task name from autopilot session', () => {
      renderPanel({ autopilotSession: completedSession })
      expect(screen.getByText('my-feature')).toBeInTheDocument()
    })

    it('shows phase stepper for session-only', () => {
      renderPanel({ autopilotSession: completedSession })
      expect(screen.getByText('BA')).toBeInTheDocument()
    })
  })
})
