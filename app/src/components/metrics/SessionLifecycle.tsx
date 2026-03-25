import { Chip, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { memo, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { SessionLifecycleMetrics } from '../../types'
import { formatDuration } from '../../utils/time'
import MetricCard from './MetricCard'

interface SessionLifecycleProps {
  data: SessionLifecycleMetrics
}

function SessionLifecycleInner({ data }: SessionLifecycleProps) {
  const theme = useTheme()
  const et = theme.palette.eventType
  const pieColors = useMemo(() => [et.tool, et.session, et.notification, et.subagent, et.error, et.task], [et])

  const sessions = data.sessions
  const avgDuration = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + s.duration_s, 0) / sessions.length
    : 0

  const peakConcurrent = data.concurrency_timeline.length > 0
    ? Math.max(...data.concurrency_timeline.map(c => c.concurrent))
    : sessions.length

  const modelData = Object.entries(data.model_distribution).map(([name, value]) => ({ name, value }))
  const sourceData = Object.entries(data.source_distribution)
  const endReasons = Object.entries(data.end_reasons)

  return (
    <MetricCard
      title="Session Lifecycle"
      isEmpty={sessions.length === 0}
      emptyMessage="No session data"
    >
      <Typography variant="headlineSmall" gutterBottom>
        {formatDuration(avgDuration)}
      </Typography>
      <Typography variant="labelMedium" color="text.secondary" gutterBottom>
        Avg duration ({sessions.length} sessions)
      </Typography>
      {sessions.length > 1 && (
        <Typography variant="titleMedium" sx={{ mt: 1 }}>
          Peak concurrent: {peakConcurrent}
        </Typography>
      )}
      {modelData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={modelData} dataKey="value" nameKey="name" outerRadius={60} label>
              {modelData.map((entry, i) => (
                <Cell key={entry.name} fill={pieColors[i % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
      {sourceData.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
          {sourceData.map(([src, count]) => (
            <Chip key={src} size="small" label={`${src}: ${count}`} variant="outlined" />
          ))}
        </Stack>
      )}
      {endReasons.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
          {endReasons.map(([reason, count]) => (
            <Chip key={reason} size="small" label={`${reason}: ${count}`} variant="outlined" />
          ))}
        </Stack>
      )}
    </MetricCard>
  )
}

const SessionLifecycle = memo(SessionLifecycleInner)
export default SessionLifecycle
