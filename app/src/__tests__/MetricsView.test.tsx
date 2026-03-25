import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../theme'

/* Mock localStorage */
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

const mockMetrics = {
  tool_usage: { by_tool: { Bash: 5, Edit: 3 }, by_session: {}, most_used: 'Bash', total: 8 },
  error_tracking: { total_errors: 0, by_tool: {}, by_session: {}, interrupts: 0, failures: 0, timeline: [] },
  session_lifecycle: { sessions: [], model_distribution: {}, source_distribution: {}, end_reasons: {}, concurrency_timeline: [] },
  permission_friction: { total_prompts: 0, by_tool: {}, by_session: {}, mode_distribution: {}, blocked_durations: [], has_tuid_data: false },
  subagent_utilization: { total_spawned: 0, by_type: {}, by_session: {}, peak_concurrent: 0, durations: [], running: [] },
  file_activity: { files: [], conflicts: [], summary: { total: 0, edited: 0, read_only: 0 }, has_fp_data: false },
  task_completion: { total: 0, by_session: {}, tasks: [], rates: {} },
  activity_timeline: { sessions: [] },
}

vi.mock('../hooks/useMetrics', () => ({
  useMetrics: () => ({ data: mockMetrics }),
}))

vi.mock('../hooks/useSessions', () => ({
  useSessions: () => ({ data: [] }),
}))

// Import after mocks
import MetricsView from '../components/metrics/MetricsView'

function renderView() {
  return render(
    <ThemeProvider theme={theme}>
      <MetricsView />
    </ThemeProvider>,
  )
}

describe('MetricsView', () => {
  it('renders filter bar with session selector and time range', () => {
    renderView()
    expect(screen.getByLabelText('Filter by session')).toBeInTheDocument()
    expect(screen.getByLabelText('Time range')).toBeInTheDocument()
  })

  it('renders KPI strip', () => {
    renderView()
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument()
  })

  it('renders all metric card regions', () => {
    renderView()
    const regions = screen.getAllByRole('region')
    // At least: Activity Timeline, Tool Usage, Error Tracking, Session Lifecycle,
    // Permission Friction, Subagent Utilization, Task Completion, File Activity = 8
    expect(regions.length).toBeGreaterThanOrEqual(8)
  })

  it('renders time range toggle buttons', () => {
    renderView()
    expect(screen.getByText('15 min')).toBeInTheDocument()
    expect(screen.getByText('1 hour')).toBeInTheDocument()
    expect(screen.getByText('6 hours')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
  })
})
