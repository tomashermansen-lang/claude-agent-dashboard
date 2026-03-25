import { useState, useMemo, lazy, Suspense } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import { useColorScheme } from '@mui/material/styles'
import { usePlans } from '../hooks/usePlans'
import { usePlan } from '../hooks/usePlan'
import type { ProjectSummary, Session } from '../types'
import { useSessions } from '../hooks/useSessions'
import { useDataFreshness } from '../hooks/useDataFreshness'
import { flattenTasks } from '../utils/planMetrics'
import Pipeline from './Pipeline'
import SessionMonitor from './SessionMonitor'
import HeroStrip from './HeroStrip'
import DataFreshnessChip from './DataFreshnessChip'
import { HoverLinkProvider } from '../contexts/HoverLinkContext'

const MetricsView = lazy(() => import('./metrics/MetricsView'))
const AutopilotView = lazy(() => import('./autopilot/AutopilotView'))

const SUPPORTED_SCHEMA_MAJORS = ['1', '2']

type DashboardView = 'plan' | 'metrics' | 'autopilot'

/* ═══ Per-project panel (calls usePlan internally) ═══ */

function ProjectPanel({ project, sessions }: { project: ProjectSummary; sessions: Session[] | undefined }) {
  const { data: plan, isLoading: planLoading } = usePlan(project.plan_dir ?? project.path ?? null)

  const projectSessionCount = useMemo(() => {
    if (!plan || !sessions) return 0
    const taskIds = new Set(flattenTasks(plan).map((t) => t.id))
    return sessions.filter((s) => {
      const feature = s.branch.split('/').pop() ?? ''
      return taskIds.has(feature) && (s.status === 'working' || s.status === 'needs_input')
    }).length
  }, [plan, sessions])

  const schemaMajor = plan?.schema_version?.split('.')[0]
  const schemaWarning =
    schemaMajor != null && !SUPPORTED_SCHEMA_MAJORS.includes(schemaMajor)

  if (planLoading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={48} sx={{ mb: 1.5, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={36} sx={{ mb: 1.5, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
      </Box>
    )
  }

  if (!plan) {
    return (
      <Alert severity="info" sx={{ borderRadius: 1 }}>
        No execution plan found for {project.project}.
      </Alert>
    )
  }

  return (
    <Box>
      <HeroStrip plan={plan} sessions={sessions ?? []} sessionCount={projectSessionCount} planDir={project.plan_dir ?? project.path} />
      {schemaWarning && (
        <Alert severity="warning" sx={{ mt: 1.5, mb: 1, borderRadius: 1 }} onClose={() => {}}>
          Plan uses schema v{plan.schema_version} — dashboard supports v{SUPPORTED_SCHEMA_MAJORS.join(', v')}.x
        </Alert>
      )}
      <Box sx={{ mt: 1.5 }}>
        <Pipeline plan={plan} sessions={sessions} projectPath={project.path} />
      </Box>
    </Box>
  )
}

export default function DashboardShell() {
  const { mode, setMode } = useColorScheme()
  const { data: projects, isLoading: projectsLoading } = usePlans()
  const { data: sessions } = useSessions()
  const [view, setView] = useState<DashboardView>(() => {
    const saved = localStorage.getItem('dashboard-view')
    return saved === 'metrics' ? 'metrics' : saved === 'autopilot' ? 'autopilot' : 'plan'
  })

  const handleViewChange = (_: React.MouseEvent<HTMLElement>, newView: DashboardView | null) => {
    if (newView) {
      setView(newView)
      localStorage.setItem('dashboard-view', newView)
    }
  }

  // Data freshness tracking
  const freshness = useDataFreshness(sessions)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Top bar */}
      <Box
        component="header"
        sx={{
          px: { xs: 1.5, sm: 2, md: 3 },
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'surface1',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          <AccountTreeIcon sx={{ fontSize: 22 }} />
          <Typography variant="titleMedium">
            Execution Graph Dashboard
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={handleViewChange}
          aria-label="Dashboard view"
          sx={{
            '& .MuiToggleButton-root': { py: 0.25, px: 1.5, fontSize: '0.75rem', minHeight: 28 },
          }}
        >
          <ToggleButton value="plan">Plan</ToggleButton>
          <ToggleButton value="metrics">Metrics</ToggleButton>
          <ToggleButton value="autopilot">Autopilot</ToggleButton>
        </ToggleButtonGroup>
        <DataFreshnessChip lastFetchTime={freshness.lastFetchTime} isTabVisible={freshness.isTabVisible} />
        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton
            size="small"
            onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle dark mode"
            sx={{ color: 'text.secondary', p: 0.5 }}
          >
            {mode === 'dark' ? <LightModeIcon sx={{ fontSize: 18 }} /> : <DarkModeIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {view === 'plan' ? (
        /* Plan view: side-by-side pipeline stack + sessions */
        <HoverLinkProvider>
        <Box
          component="main"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 0,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Pipeline panel — all projects stacked vertically */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              px: { xs: 1.5, sm: 2, md: 3 },
              py: { xs: 1.5, md: 2 },
              overflowY: 'auto',
              borderRight: { md: '1px solid' },
              borderColor: { md: 'divider' },
            }}
          >
            {projectsLoading ? (
              <Box>
                <Skeleton variant="rectangular" height={48} sx={{ mb: 1.5, borderRadius: 1 }} />
                <Skeleton variant="rectangular" height={36} sx={{ mb: 1.5, borderRadius: 1 }} />
                <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
              </Box>
            ) : !projects || projects.length === 0 ? (
              <Box sx={{ textAlign: 'center', mt: 8 }}>
                <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                  No projects with execution plans found
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Run /plan-project in a project to generate an execution plan.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {projects.map((p) => (
                  <ProjectPanel key={p.plan_dir ?? p.path} project={p} sessions={sessions} />
                ))}
              </Box>
            )}
          </Box>

          {/* Sessions panel (full height right sidebar) */}
          <Box
            sx={{
              width: { md: 360, lg: 400, xl: 440 },
              flexShrink: 0,
              minHeight: 0,
              px: { xs: 1.5, sm: 2, md: 2 },
              py: { xs: 1.5, md: 2 },
              overflowY: 'auto',
              borderTop: { xs: '1px solid', md: 'none' },
              borderColor: 'divider',
            }}
          >
            <SessionMonitor />
          </Box>
        </Box>
        </HoverLinkProvider>
      ) : view === 'autopilot' ? (
        /* Autopilot view */
        <Suspense fallback={
          <Box sx={{ p: 3 }}>
            <Skeleton variant="rectangular" height={48} sx={{ mb: 1.5, borderRadius: 1 }} />
            <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
          </Box>
        }>
          <AutopilotView />
        </Suspense>
      ) : (
        /* Metrics view */
        <Box component="main" sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Suspense fallback={
            <Box sx={{ p: 3 }}>
              <Skeleton variant="rectangular" height={48} sx={{ mb: 1.5, borderRadius: 1 }} />
              <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
            </Box>
          }>
            <MetricsView />
          </Suspense>
        </Box>
      )}
    </Box>
  )
}
