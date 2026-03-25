import { useState, useMemo, useEffect } from 'react'
import Box from '@mui/material/Box'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import { useMetrics } from '../../hooks/useMetrics'
import { useSessions } from '../../hooks/useSessions'
import KpiStrip from './KpiStrip'
import ActivityTimeline from './ActivityTimeline'
import ToolUsage from './ToolUsage'
import ErrorTracking from './ErrorTracking'
import SessionLifecycle from './SessionLifecycle'
import PermissionFriction from './PermissionFriction'
import SubagentUtil from './SubagentUtil'
import TaskCompletion from './TaskCompletion'
import FileActivity from './FileActivity'

type TimeRange = '15m' | '1h' | '6h' | 'all'

function computeSince(range: TimeRange): string | undefined {
  if (range === 'all') return undefined
  const mins = range === '15m' ? 15 : range === '1h' ? 60 : 360
  return new Date(Date.now() - mins * 60_000).toISOString()
}

export default function MetricsView() {
  const [selectedSid, setSelectedSid] = useState<string | 'all'>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')

  // Refresh since every 30s to keep time window accurate
  const [sinceKey, setSinceKey] = useState(0)
  useEffect(() => {
    if (timeRange === 'all') return
    const id = setInterval(() => setSinceKey(k => k + 1), 30_000)
    return () => clearInterval(id)
  }, [timeRange])

  const since = useMemo(() => computeSince(timeRange), [timeRange, sinceKey])
  const { data: metrics } = useMetrics(
    selectedSid !== 'all' ? selectedSid : undefined,
    since,
  )
  const { data: sessions } = useSessions()

  // Build session list for the selector
  const sessionOptions = useMemo(() => {
    if (!sessions) return []
    return sessions.map(s => ({
      sid: s.sid,
      label: `${s.branch} — ${s.sid.slice(0, 7)}`,
    }))
  }, [sessions])

  return (
    <Box sx={{ px: { xs: 1.5, sm: 2, md: 3 }, py: { xs: 1.5, md: 2 }, overflowY: 'auto', height: '100%' }}>
      {/* Filter Bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Select
          size="small"
          value={selectedSid}
          onChange={(e) => setSelectedSid(e.target.value)}
          displayEmpty
          aria-label="Filter by session"
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All Sessions</MenuItem>
          {sessionOptions.map(opt => (
            <MenuItem key={opt.sid} value={opt.sid}>{opt.label}</MenuItem>
          ))}
        </Select>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={timeRange}
          onChange={(_, v) => { if (v) setTimeRange(v) }}
          aria-label="Time range"
        >
          <ToggleButton value="15m">15 min</ToggleButton>
          <ToggleButton value="1h">1 hour</ToggleButton>
          <ToggleButton value="6h">6 hours</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* KPI Strip */}
      <Box sx={{ mb: 2 }}>
        <KpiStrip metrics={metrics} selectedSid={selectedSid} />
      </Box>

      {!metrics ? (
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Loading metrics...
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {/* M8 Activity Timeline — full width */}
          <Grid size={12}>
            <ActivityTimeline data={metrics.activity_timeline} selectedSid={selectedSid} />
          </Grid>

          {/* M1 + M2 side by side */}
          <Grid size={{ xs: 12, md: 6 }}>
            <ToolUsage data={metrics.tool_usage} selectedSid={selectedSid} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <ErrorTracking data={metrics.error_tracking} selectedSid={selectedSid} />
          </Grid>

          {/* M3 + M4 side by side */}
          <Grid size={{ xs: 12, md: 6 }}>
            <SessionLifecycle data={metrics.session_lifecycle} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <PermissionFriction data={metrics.permission_friction} selectedSid={selectedSid} />
          </Grid>

          {/* M5 + M7 side by side */}
          <Grid size={{ xs: 12, md: 6 }}>
            <SubagentUtil data={metrics.subagent_utilization} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TaskCompletion data={metrics.task_completion} selectedSid={selectedSid} />
          </Grid>

          {/* M6 File Activity — full width */}
          <Grid size={12}>
            <FileActivity data={metrics.file_activity} />
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
