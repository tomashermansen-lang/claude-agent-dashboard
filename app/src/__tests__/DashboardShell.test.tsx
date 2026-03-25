import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../theme'
import DashboardShell from '../components/DashboardShell'

/* Mock localStorage (jsdom may not provide it) */
const storageMock: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => storageMock[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { storageMock[key] = value }),
    removeItem: vi.fn((key: string) => { delete storageMock[key] }),
    clear: vi.fn(),
    get length() { return Object.keys(storageMock).length },
    key: vi.fn((_: number) => null),
  },
  writable: true,
})

// Mock HoverLinkContext
vi.mock('../contexts/HoverLinkContext', () => ({
  HoverLinkProvider: ({ children }: { children: React.ReactNode }) => children,
  useHoverLink: () => ({
    hoveredTaskId: null,
    hoveredSessionBranch: null,
    setHoveredTask: vi.fn(),
    setHoveredSession: vi.fn(),
  }),
}))

// Mock hooks
vi.mock('../hooks/usePlans', () => ({
  usePlans: () => ({
    data: [{ project: 'test-project', path: '/tmp/test', phases: 3, progress: 50, has_plan: true }],
    isLoading: false,
  }),
}))

vi.mock('../hooks/usePlan', () => ({
  usePlan: () => ({
    data: {
      schema_version: '1.0.0',
      name: 'Test',
      description: 'Test plan description',
      phases: [
        {
          id: 'p1',
          name: 'Phase 1',
          tasks: [
            { id: 't1', name: 'Task One', status: 'done' },
            { id: 't2', name: 'Task Two', status: 'wip' },
          ],
        },
      ],
    },
    isLoading: false,
  }),
}))

const mockSessions = [
  {
    sid: 's1',
    cwd: '/tmp/test',
    worktree: '/tmp/test',
    branch: 'feature/t2',
    event: 'Notification',
    type: 'assistant',
    msg: 'working',
    ts: new Date().toISOString(),
    status: 'working' as const,
    flow: null,
  },
]

vi.mock('../hooks/useSessions', () => ({
  useSessions: () => ({ data: mockSessions }),
}))

function renderShell() {
  return render(
    <ThemeProvider theme={theme}>
      <DashboardShell />
    </ThemeProvider>,
  )
}

/* ═══ Core layout ═══ */
describe('DashboardShell: core layout', () => {
  it('renders header, pipeline panel, and sessions panel', () => {
    renderShell()
    expect(screen.getByText('Execution Graph Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('renders a header element for the top bar', () => {
    renderShell()
    const header = document.querySelector('header')
    expect(header).toBeTruthy()
  })

  it('main area renders as semantic main element', () => {
    renderShell()
    const main = document.querySelector('main')
    expect(main).toBeTruthy()
  })
})

/* ═══ HeroStrip integration ═══ */
describe('DashboardShell: HeroStrip', () => {
  it('renders HeroStrip with plan name when plan is loaded', () => {
    renderShell()
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('renders plan description in HeroStrip', () => {
    renderShell()
    expect(screen.getByText('Test plan description')).toBeInTheDocument()
  })

  it('renders active session count in HeroStrip', () => {
    renderShell()
    // 1 working session — may appear in both HeroStrip and SessionMonitor
    const matches = screen.getAllByText('1 working')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })
})

/* ═══ DataFreshnessChip integration ═══ */
describe('DashboardShell: DataFreshnessChip', () => {
  it('renders data freshness indicator in header', () => {
    renderShell()
    // DataFreshnessChip renders one of: Live, Stale, Paused, Connecting
    const freshness = screen.getByText(/Live|Stale|Paused|Connecting/)
    expect(freshness).toBeInTheDocument()
  })
})

/* ═══ View toggle ═══ */
describe('DashboardShell: view toggle', () => {
  it('renders Plan/Metrics/Autopilot toggle buttons', () => {
    renderShell()
    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Metrics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Autopilot' })).toBeInTheDocument()
  })

  it('has aria-label on toggle group', () => {
    renderShell()
    expect(screen.getByRole('group', { name: 'Dashboard view' })).toBeInTheDocument()
  })

  it('defaults to Plan view with plan button pressed', () => {
    renderShell()
    const planButton = screen.getByRole('button', { name: 'Plan' })
    expect(planButton.getAttribute('aria-pressed')).toBe('true')
  })

  it('persists view choice to localStorage on Metrics click', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Metrics' }))
    expect(storageMock['dashboard-view']).toBe('metrics')
  })

  it('persists view choice to localStorage on Autopilot click', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Autopilot' }))
    expect(storageMock['dashboard-view']).toBe('autopilot')
  })
})
