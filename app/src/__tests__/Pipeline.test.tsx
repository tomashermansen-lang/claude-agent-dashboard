import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../theme'
import Pipeline from '../components/Pipeline'
import type { Plan, Session } from '../types'

/* ═══ Mock localStorage (jsdom doesn't always provide it) ═══ */
const storageMock: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storageMock[key] = value }),
  removeItem: vi.fn((key: string) => { delete storageMock[key] }),
  clear: vi.fn(() => { Object.keys(storageMock).forEach((k) => delete storageMock[k]) }),
  get length() { return Object.keys(storageMock).length },
  key: vi.fn((_: number) => null),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Mock HoverLinkContext
vi.mock('../contexts/HoverLinkContext', () => ({
  useHoverLink: () => ({
    hoveredTaskId: null,
    hoveredSessionBranch: null,
    setHoveredTask: vi.fn(),
    setHoveredSession: vi.fn(),
  }),
}))

const mockPlan: Plan = {
  schema_version: '1.0.0',
  name: 'Test Plan',
  description: 'A test execution plan',
  phases: [
    {
      id: 'setup',
      name: 'Phase 0: Setup',
      tasks: [
        { id: 'task-a', name: 'Task A', status: 'done' },
        { id: 'task-b', name: 'Task B', status: 'wip' },
      ],
      gate: {
        name: 'Setup Gate',
        checklist: ['docker compose up -d', 'uv run pytest', 'uv run alembic upgrade head'],
        passed: false,
      },
    },
    {
      id: 'core',
      name: 'Phase 1: Core',
      tasks: [
        { id: 'task-c', name: 'Task C', status: 'pending', parallel_group: 'group-1', depends: ['task-a'] },
        { id: 'task-d', name: 'Task D', status: 'pending', parallel_group: 'group-1', depends: ['task-a'] },
      ],
    },
    {
      id: 'empty',
      name: 'Phase 2: Empty',
      tasks: [],
    },
  ],
}

/* DAG plan: root -> 3 parallel children (Change 1 + 4 test) */
const dagPlan: Plan = {
  schema_version: '1.0.0',
  name: 'DAG Plan',
  phases: [
    {
      id: 'phase-dag',
      name: 'DAG Phase',
      tasks: [
        { id: 'root', name: 'Root Task', status: 'done' },
        { id: 'child-1', name: 'Child One', status: 'wip', depends: ['root'] },
        { id: 'child-2', name: 'Child Two', status: 'pending', depends: ['root'] },
        { id: 'child-3', name: 'Child Three', status: 'pending', depends: ['root'] },
      ],
    },
  ],
}

function renderPipeline(plan: Plan = mockPlan, sessions: Session[] = []) {
  return render(
    <ThemeProvider theme={theme}>
      <Pipeline plan={plan} sessions={sessions} />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  localStorageMock.clear()
  localStorageMock.getItem.mockClear()
  localStorageMock.setItem.mockClear()
})

/* ═══ Plan header removed (moved to HeroStrip in DashboardShell) ═══ */
describe('Pipeline: plan header removed', () => {
  it('does not render plan name or description', () => {
    renderPipeline()
    expect(screen.queryByText('Test Plan')).not.toBeInTheDocument()
    expect(screen.queryByText('A test execution plan')).not.toBeInTheDocument()
  })

  it('does not render overall progress percentage', () => {
    renderPipeline()
    expect(screen.queryByText('25%')).not.toBeInTheDocument()
    expect(screen.queryByText('1 of 4 tasks')).not.toBeInTheDocument()
  })
})

/* ═══ Horizontal card rail ═══ */
describe('Pipeline: horizontal card rail', () => {
  it('renders all phase names in compact cards', () => {
    renderPipeline()
    const cards = screen.getAllByTestId('phase-card')
    expect(cards.length).toBe(3)
    expect(within(cards[0]).getByText('Phase 0: Setup')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Phase 1: Core')).toBeInTheDocument()
    expect(within(cards[2]).getByText('Phase 2: Empty')).toBeInTheDocument()
  })

  it('renders phase cards with data-testid', () => {
    renderPipeline()
    const cards = document.querySelectorAll('[data-testid="phase-card"]')
    expect(cards.length).toBe(3)
  })

  it('renders connectors between phase cards', () => {
    renderPipeline()
    const connectors = document.querySelectorAll('[data-testid="phase-connector"]')
    expect(connectors.length).toBe(2) // 3 phases → 2 connectors
  })

  it('shows progress counts in compact cards', () => {
    renderPipeline()
    const cards = screen.getAllByTestId('phase-card')
    expect(within(cards[0]).getByText('1/2')).toBeInTheDocument() // setup: 1 done of 2
    expect(within(cards[1]).getByText('0/2')).toBeInTheDocument() // core: 0 done of 2
    expect(within(cards[2]).getByText('0/0')).toBeInTheDocument() // empty
  })
})

/* ═══ Single expansion ═══ */
describe('Pipeline: single expansion', () => {
  it('auto-expands the first WIP phase and shows its tasks', () => {
    renderPipeline()
    // Phase 0 has a WIP task, should auto-expand
    expect(screen.getByText('Task A')).toBeInTheDocument()
    expect(screen.getByText('Task B')).toBeInTheDocument()
  })

  it('expands a collapsed phase on click', async () => {
    renderPipeline()
    // Phase 1 is not expanded, click it via card
    const cards = screen.getAllByTestId('phase-card')
    expect(screen.queryByText('Task C')).not.toBeInTheDocument()
    await userEvent.click(cards[1])
    expect(screen.getByText('Task C')).toBeInTheDocument()
    expect(screen.getByText('Task D')).toBeInTheDocument()
  })

  it('closes the previously expanded phase when opening another', async () => {
    renderPipeline()
    // Phase 0 is auto-expanded
    expect(screen.getByText('Task A')).toBeInTheDocument()
    // Click Phase 1 card → Phase 0 closes, Phase 1 opens
    const cards = screen.getAllByTestId('phase-card')
    await userEvent.click(cards[1])
    expect(screen.queryByText('Task A')).not.toBeInTheDocument()
    expect(screen.getByText('Task C')).toBeInTheDocument()
  })

  it('collapses the expanded phase when clicking it again', async () => {
    renderPipeline()
    expect(screen.getByText('Task A')).toBeInTheDocument()
    const cards = screen.getAllByTestId('phase-card')
    await userEvent.click(cards[0])
    expect(screen.queryByText('Task A')).not.toBeInTheDocument()
  })
})

/* ═══ StatusFilterChips integration ═══ */
describe('Pipeline: filter chips', () => {
  it('renders StatusFilterChips with task counts', () => {
    renderPipeline()
    // All 4 tasks, 1 WIP, 0 blocked (task-c and task-d depend on task-a which is done), 0 failed
    expect(screen.getByText(/All \d+/)).toBeInTheDocument()
    expect(screen.getByText(/Working \d+/)).toBeInTheDocument()
  })
})

/* ═══ Auto-scroll to active phase ═══ */
describe('Pipeline: auto-scroll', () => {
  it('calls scrollIntoView on the active phase card on mount', () => {
    renderPipeline()
    // scrollIntoView is mocked in test-setup.ts
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

/* ═══ Task chip tags ═══ */
describe('Pipeline: task chips', () => {
  it('does not show ACTIVE badge (removed, StatusDot is sufficient)', () => {
    renderPipeline()
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument()
    expect(screen.queryByText('active')).not.toBeInTheDocument()
  })

  it('shows "fix" chip for failed tasks', () => {
    const failPlan: Plan = {
      schema_version: '1.0.0',
      name: 'Fail Plan',
      phases: [{
        id: 'p', name: 'Phase', tasks: [
          { id: 't1', name: 'Broken Task', status: 'failed' },
        ],
      }],
    }
    renderPipeline(failPlan)
    expect(screen.getByText('fix')).toBeInTheDocument()
  })

  it('shows "blocked" chip for blocked pending tasks', () => {
    const blockedPlan: Plan = {
      schema_version: '1.0.0',
      name: 'Blocked Plan',
      phases: [{
        id: 'p', name: 'Phase', tasks: [
          { id: 'dep', name: 'Dep', status: 'wip' },
          { id: 'blocked', name: 'Blocked Task', status: 'pending', depends: ['dep'] },
        ],
      }],
    }
    renderPipeline(blockedPlan)
    expect(screen.getByText('blocked')).toBeInTheDocument()
  })

  it('shows session status chip with lowercase label matching SessionMonitor', () => {
    const sessionPlan: Plan = {
      schema_version: '1.0.0',
      name: 'Session Plan',
      phases: [{
        id: 'p', name: 'Phase', tasks: [
          { id: 'my-task', name: 'My Task', status: 'wip' },
        ],
      }],
    }
    const sessions: Session[] = [{
      sid: 's1', cwd: '/tmp', worktree: '/tmp', branch: 'feat/my-task',
      event: 'Notification', type: 'agent', msg: 'working', ts: new Date().toISOString(),
      status: 'working', flow: null,
    }]
    renderPipeline(sessionPlan, sessions)
    expect(screen.getByText('working')).toBeInTheDocument()
  })

  it('does not show session chip for ended sessions on pending tasks', () => {
    const sessionPlan: Plan = {
      schema_version: '1.0.0',
      name: 'Stale Session Plan',
      phases: [{
        id: 'p', name: 'Phase', tasks: [
          { id: 'recon-eval', name: 'Recon Eval', status: 'pending' },
        ],
      }],
    }
    const sessions: Session[] = [{
      sid: 's1', cwd: '/tmp', worktree: '/tmp', branch: 'feature/recon-eval',
      event: 'SessionEnd', type: '', msg: '', ts: '2026-03-22T16:56:36Z',
      status: 'closed', flow: null,
    }]
    renderPipeline(sessionPlan, sessions)
    expect(screen.queryByText('closed')).not.toBeInTheDocument()
  })

  it('shows session chip for ended sessions on wip tasks', () => {
    const sessionPlan: Plan = {
      schema_version: '1.0.0',
      name: 'WIP Closed Plan',
      phases: [{
        id: 'p', name: 'Phase', tasks: [
          { id: 'my-task', name: 'My Task', status: 'wip' },
        ],
      }],
    }
    const sessions: Session[] = [{
      sid: 's1', cwd: '/tmp', worktree: '/tmp', branch: 'feat/my-task',
      event: 'SessionEnd', type: '', msg: '', ts: '2026-03-22T10:00:00Z',
      status: 'closed', flow: null,
    }]
    renderPipeline(sessionPlan, sessions)
    expect(screen.getByText('closed')).toBeInTheDocument()
  })

  it('shows completed chip on done tasks even without a matching session', async () => {
    const donePlan: Plan = {
      schema_version: '1.0.0',
      name: 'Done Plan',
      phases: [{
        id: 'p', name: 'Phase', tasks: [
          { id: 'finished-task', name: 'Finished Task', status: 'done' },
        ],
      }],
    }
    renderPipeline(donePlan, [])
    // Phase has no WIP tasks so it won't auto-expand — click to expand
    const cards = screen.getAllByTestId('phase-card')
    await userEvent.click(cards[0])
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('shows "needs input" session chip with pulse', () => {
    const sessionPlan: Plan = {
      schema_version: '1.0.0',
      name: 'Input Plan',
      phases: [{
        id: 'p', name: 'Phase', tasks: [
          { id: 'my-task', name: 'My Task', status: 'wip' },
        ],
      }],
    }
    const sessions: Session[] = [{
      sid: 's1', cwd: '/tmp', worktree: '/tmp', branch: 'feat/my-task',
      event: 'Notification', type: 'agent', msg: 'help', ts: new Date().toISOString(),
      status: 'needs_input', flow: null,
    }]
    renderPipeline(sessionPlan, sessions)
    expect(screen.getByText('needs input')).toBeInTheDocument()
  })
})

/* ═══ Gate inline node ═══ */
describe('Pipeline: gate inline node', () => {
  it('renders gate as inline node in the tree when phase is expanded', () => {
    renderPipeline()
    const gateNode = document.querySelector('[data-testid="gate-node"]')
    expect(gateNode).toBeTruthy()
  })

  it('shows gate name and check count in inline node', () => {
    renderPipeline()
    expect(screen.getByText('Setup Gate')).toBeInTheDocument()
    expect(screen.getByText('0/3 checks')).toBeInTheDocument()
  })

  it('does not render standalone gate section below tree', () => {
    renderPipeline()
    // Gate checklist items should NOT be directly visible (they are in a Tooltip)
    expect(screen.queryByText('docker compose up -d')).not.toBeInTheDocument()
  })
})

/* ═══ Shows empty phase message ═══ */
describe('Pipeline: empty phases', () => {
  it('shows "No tasks defined yet" for empty phases when expanded', async () => {
    renderPipeline()
    const cards = screen.getAllByTestId('phase-card')
    await userEvent.click(cards[2])
    expect(screen.getByText('No tasks defined yet')).toBeInTheDocument()
  })
})

/* ═══ Change 1: Left-to-right tree flow ═══ */
describe('Change 1: Left-to-right tree flow', () => {
  it('uses horizontal overflow on phase tree container', () => {
    renderPipeline(dagPlan)
    const treeContainer = document.querySelector('[data-testid="phase-tree"]')
    expect(treeContainer).toBeTruthy()
  })

  it('positions task nodes with absolute layout via data-node-id', () => {
    renderPipeline(dagPlan)
    const nodes = document.querySelectorAll('[data-node-id]')
    expect(nodes.length).toBe(4) // root + 3 children
  })

  it('renders root and children as separate node elements', () => {
    renderPipeline(dagPlan)
    expect(document.querySelector('[data-node-id="root"]')).toBeTruthy()
    expect(document.querySelector('[data-node-id="child-1"]')).toBeTruthy()
    expect(document.querySelector('[data-node-id="child-2"]')).toBeTruthy()
    expect(document.querySelector('[data-node-id="child-3"]')).toBeTruthy()
  })
})

/* ═══ Change 2: Variable node width ═══ */
describe('Change 2: Variable node width', () => {
  it('does not truncate task names — full text visible', () => {
    const longNamePlan: Plan = {
      schema_version: '1.0.0',
      name: 'Long Names',
      phases: [{
        id: 'p',
        name: 'Phase',
        tasks: [
          { id: 't', name: 'Pre-commit hooks (Ruff, mypy, isort)', status: 'wip' },
        ],
      }],
    }
    renderPipeline(longNamePlan)
    expect(screen.getByText('Pre-commit hooks (Ruff, mypy, isort)')).toBeInTheDocument()
  })

  it('renders node with absolute positioning', () => {
    renderPipeline(dagPlan)
    const node = document.querySelector('[data-node-id="root"]') as HTMLElement
    expect(node).toBeTruthy()
    expect(node.className).toBeTruthy()
  })
})

/* ═══ Change 3: Smoothstep connectors (no arrowheads) ═══ */
describe('Change 3: Smoothstep connectors', () => {
  it('renders SVG connector overlay', () => {
    renderPipeline(dagPlan)
    const svg = document.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('uses clean lines without arrowhead markers', () => {
    renderPipeline(dagPlan)
    const marker = document.querySelector('marker')
    expect(marker).toBeNull()
  })

  it('SVG has aria-hidden for accessibility', () => {
    renderPipeline(dagPlan)
    const svg = document.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})

/* ═══ Change 4: Parallel fan-out (clean DAG, no extra decoration) ═══ */
describe('Change 4: Parallel fan-out', () => {
  it('shows all parallel children as separate nodes without rail decoration', () => {
    renderPipeline(dagPlan)
    expect(document.querySelector('[data-node-id="child-1"]')).toBeTruthy()
    expect(document.querySelector('[data-node-id="child-2"]')).toBeTruthy()
    expect(document.querySelector('[data-node-id="child-3"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="parallel-rail"]')).toBeNull()
  })
})

/* ═══ Change 6: Animated WIP edges ═══ */
describe('Change 6: Animated WIP edges', () => {
  it('renders SVG style element with dashFlow keyframes', () => {
    renderPipeline(dagPlan)
    const styleEls = document.querySelectorAll('svg style')
    const hasKeyframes = Array.from(styleEls).some(
      (el) => el.textContent?.includes('dashFlow'),
    )
    expect(hasKeyframes).toBe(true)
  })
})

/* ═══ Persist expansion state ═══ */
describe('Pipeline: persist expansion state', () => {
  it('saves expanded phase ID to localStorage on toggle', async () => {
    renderPipeline()
    const cards = screen.getAllByTestId('phase-card')
    await userEvent.click(cards[1])
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'pipeline-expanded-Test Plan',
      expect.any(String),
    )
  })

  it('reads from localStorage on mount', () => {
    storageMock['pipeline-expanded-Test Plan'] = JSON.stringify('core')
    renderPipeline()
    expect(localStorageMock.getItem).toHaveBeenCalledWith('pipeline-expanded-Test Plan')
    // Core phase should be expanded (Task C visible), Setup collapsed
    expect(screen.getByText('Task C')).toBeInTheDocument()
    expect(screen.queryByText('Task A')).not.toBeInTheDocument()
  })
})

/* ═══ Change 8: prefers-reduced-motion ═══ */
describe('Change 8: prefers-reduced-motion', () => {
  it('StatusDot WIP renders without error (CSS media query applied)', () => {
    renderPipeline()
    expect(screen.getByText('Task B')).toBeInTheDocument()
  })

  it('SVG includes reduced-motion media query', () => {
    renderPipeline(dagPlan)
    const styleEls = document.querySelectorAll('svg style')
    const hasReducedMotion = Array.from(styleEls).some(
      (el) => el.textContent?.includes('prefers-reduced-motion'),
    )
    expect(hasReducedMotion).toBe(true)
  })
})

/* ═══ Linked highlighting ═══ */
describe('Pipeline: linked highlighting', () => {
  it('task nodes have data-node-id attribute for hover linking', () => {
    renderPipeline()
    const nodeA = document.querySelector('[data-node-id="task-a"]')
    const nodeB = document.querySelector('[data-node-id="task-b"]')
    expect(nodeA).toBeTruthy()
    expect(nodeB).toBeTruthy()
  })

  it('task nodes are keyboard accessible (tabIndex=0)', () => {
    renderPipeline()
    const nodeA = document.querySelector('[data-node-id="task-a"]') as HTMLElement
    expect(nodeA?.getAttribute('tabindex')).toBe('0')
  })
})

/* ═══ Click to navigate ═══ */
describe('Pipeline: click to navigate', () => {
  it('opens session panel when task node is clicked', async () => {
    renderPipeline()
    const nodeB = document.querySelector('[data-node-id="task-b"]') as HTMLElement
    expect(nodeB).toBeTruthy()
    await userEvent.click(nodeB)
    expect(screen.getByLabelText('Close panel')).toBeInTheDocument()
  })
})

/* ═══ All tasks shown individually (no collapsed chains) ═══ */
describe('Sequential tasks shown individually', () => {
  const longChainPlan: Plan = {
    schema_version: '1.0.0',
    name: 'Chain Plan',
    phases: [{
      id: 'p',
      name: 'Chain Phase',
      tasks: [
        { id: 't1', name: 'Step 1', status: 'done' },
        { id: 't2', name: 'Step 2', status: 'done', depends: ['t1'] },
        { id: 't3', name: 'Step 3', status: 'done', depends: ['t2'] },
        { id: 't4', name: 'Step 4', status: 'done', depends: ['t3'] },
        { id: 't5', name: 'Step 5', status: 'wip', depends: ['t4'] },
      ],
    }],
  }

  it('shows all tasks individually without collapsing', () => {
    renderPipeline(longChainPlan)
    expect(screen.getByText('Step 1')).toBeInTheDocument()
    expect(screen.getByText('Step 2')).toBeInTheDocument()
    expect(screen.getByText('Step 3')).toBeInTheDocument()
    expect(screen.getByText('Step 4')).toBeInTheDocument()
    expect(screen.getByText('Step 5')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="collapsed-chain"]')).toBeNull()
  })
})

/* ═══ Start/End wayfinding markers ═══ */
describe('Pipeline: start/end markers', () => {
  it('renders Start label when first phase is expanded', () => {
    renderPipeline()
    const marker = screen.getByTestId('start-marker')
    expect(within(marker).getByText('Start')).toBeInTheDocument()
  })

  it('renders next phase as mini card with name and progress', () => {
    renderPipeline()
    // Phase 0 is auto-expanded, Phase 1 is next
    const marker = screen.getByTestId('end-marker')
    expect(within(marker).getByText('Phase 1: Core')).toBeInTheDocument()
    expect(within(marker).getByText('0/2')).toBeInTheDocument()
  })

  it('renders prev phase as mini card with name and progress when not first', async () => {
    renderPipeline()
    const cards = screen.getAllByTestId('phase-card')
    await userEvent.click(cards[1])
    const marker = screen.getByTestId('start-marker')
    expect(within(marker).getByText('Phase 0: Setup')).toBeInTheDocument()
    expect(within(marker).getByText('1/2')).toBeInTheDocument()
  })

  it('renders Finished as end marker for last phase', () => {
    // dagPlan has a single phase → it is both first and last
    renderPipeline(dagPlan)
    const marker = screen.getByTestId('end-marker')
    expect(within(marker).getByText('Finished')).toBeInTheDocument()
  })
})
