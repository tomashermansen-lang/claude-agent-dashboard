import { Box, Paper, Typography } from '@mui/material'
import { memo } from 'react'
import type { MetricsResponse } from '../../types'
import { formatDuration } from '../../utils/time'

interface KpiStripProps {
  metrics: MetricsResponse | undefined
  selectedSid: string | 'all'
}

function KpiStripInner({ metrics, selectedSid }: KpiStripProps) {
  const isSingle = selectedSid !== 'all'

  let sessionsValue = '0'
  let sessionsLabel = 'Sessions'
  let toolsValue = '0'
  let errorRate = '—'
  let frictionRate = '—'
  let tasksValue = '0'

  if (metrics) {
    if (isSingle) {
      const sess = metrics.session_lifecycle.sessions.find(s => s.sid === selectedSid)
      sessionsValue = sess ? formatDuration(sess.duration_s) : '—'
      sessionsLabel = 'Duration'
      toolsValue = String(metrics.tool_usage.by_session[selectedSid]?.count ?? 0)
      const errInfo = metrics.error_tracking.by_session[selectedSid]
      errorRate = errInfo ? `${errInfo.rate}%` : '—'
      const toolCount = metrics.tool_usage.by_session[selectedSid]?.count ?? 0
      const permPrompts = metrics.permission_friction.by_session[selectedSid]?.prompts ?? 0
      frictionRate = toolCount > 0
        ? `${((permPrompts / toolCount) * 100).toFixed(1)}%`
        : '—'
      const responses = metrics.task_completion.responses_by_session?.[selectedSid] ?? 0
      const tasks = metrics.task_completion.by_session[selectedSid] ?? 0
      tasksValue = tasks > 0 ? `${responses} / ${tasks}` : String(responses)
    } else {
      sessionsValue = String(metrics.session_lifecycle.sessions.length)
      toolsValue = String(metrics.tool_usage.total)
      const totalTools = metrics.tool_usage.total
      errorRate = totalTools > 0
        ? `${((metrics.error_tracking.total_errors / totalTools) * 100).toFixed(1)}%`
        : '—'
      frictionRate = totalTools > 0
        ? `${((metrics.permission_friction.total_prompts / totalTools) * 100).toFixed(1)}%`
        : '—'
      const totalResponses = metrics.task_completion.total_responses ?? 0
      const totalTasks = metrics.task_completion.total
      tasksValue = totalTasks > 0 ? `${totalResponses} / ${totalTasks}` : String(totalResponses)
    }
  }

  const cards = [
    { value: sessionsValue, label: sessionsLabel },
    { value: toolsValue, label: 'Tool Calls' },
    { value: errorRate, label: 'Error Rate' },
    { value: frictionRate, label: 'Friction Rate' },
    { value: tasksValue, label: 'Responses / Tasks' },
  ]

  return (
    <Box
      display="flex"
      gap={2}
      flexWrap="wrap"
      aria-live="polite"
      data-testid="kpi-strip"
    >
      {cards.map(card => (
        <Paper
          key={card.label}
          sx={{ flex: 1, p: 2, textAlign: 'center', minWidth: 120 }}
          aria-label={`${card.label}: ${card.value}`}
        >
          <Typography variant="headlineSmall">{card.value}</Typography>
          <Typography variant="labelMedium" color="text.secondary">{card.label}</Typography>
        </Paper>
      ))}
    </Box>
  )
}

const KpiStrip = memo(KpiStripInner)
export default KpiStrip
