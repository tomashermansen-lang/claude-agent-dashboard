import { List, ListItem, ListItemIcon, ListItemText, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { memo, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { TaskCompletionMetrics } from '../../types'
import MetricCard from './MetricCard'

interface TaskCompletionProps {
  data: TaskCompletionMetrics
  selectedSid: string | 'all'
}

function TaskCompletionInner({ data, selectedSid }: TaskCompletionProps) {
  const totalResponses = data.total_responses ?? 0
  const responsesBySid = data.responses_by_session ?? {}

  const tasks = selectedSid !== 'all'
    ? data.tasks.filter(t => t.sid === selectedSid)
    : data.tasks

  const filteredResponses = selectedSid !== 'all'
    ? (responsesBySid[selectedSid] ?? 0)
    : totalResponses

  const filteredTasks = selectedSid !== 'all'
    ? (data.by_session[selectedSid] ?? 0)
    : data.total

  const isEmpty = filteredResponses === 0 && filteredTasks === 0

  // Build per-session grouped bar data
  const chartData = useMemo(() => {
    const sids = new Set<string>()

    // Collect all sessions that have either responses or tasks
    for (const sid of Object.keys(responsesBySid)) sids.add(sid)
    for (const sid of Object.keys(data.by_session)) sids.add(sid)

    if (selectedSid !== 'all') {
      sids.clear()
      sids.add(selectedSid)
    }

    return Array.from(sids).map(sid => ({
      session: sid.slice(0, 7),
      responses: responsesBySid[sid] ?? 0,
      tasks: data.by_session[sid] ?? 0,
    })).filter(d => d.responses > 0 || d.tasks > 0)
      .sort((a, b) => (b.responses + b.tasks) - (a.responses + a.tasks))
  }, [data.by_session, responsesBySid, selectedSid])

  const rate = selectedSid !== 'all'
    ? data.rates[selectedSid]
    : undefined

  return (
    <MetricCard
      title="Task Completion"
      isEmpty={isEmpty}
      emptyMessage="No activity"
    >
      <Typography variant="headlineSmall" gutterBottom>
        {filteredResponses}{filteredTasks > 0 ? ` / ${filteredTasks}` : ''}
      </Typography>
      <Typography variant="labelMedium" color="text.secondary" gutterBottom>
        Responses{filteredTasks > 0 ? ' / Tasks' : ''}
      </Typography>
      {rate !== undefined && (
        <Typography variant="titleMedium" gutterBottom>
          {rate} tasks/hr
        </Typography>
      )}
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={Math.max(80, chartData.length * 32)}>
          <BarChart layout="vertical" data={chartData} margin={{ left: 0, right: 16 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="session" width={60} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name) => [value, name === 'responses' ? 'Responses (Stop)' : 'Tasks (Completed)']}
              labelFormatter={(label) => `Session ${String(label)}`}
            />
            <Legend
              formatter={(value: string) => value === 'responses' ? 'Responses' : 'Tasks'}
              iconSize={10}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Bar dataKey="responses" fill="var(--mui-palette-info-main)" radius={[0, 4, 4, 0]} />
            <Bar dataKey="tasks" fill="var(--mui-palette-success-main)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      {tasks.length > 0 && (
        <List dense>
          {tasks.slice(0, 10).map(t => (
            <ListItem key={`${t.sid}-${t.ts}`} disablePadding>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <CheckCircleIcon fontSize="small" color="success" />
              </ListItemIcon>
              <ListItemText
                primary={t.subject}
                secondary={new Date(t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              />
            </ListItem>
          ))}
        </List>
      )}
    </MetricCard>
  )
}

const TaskCompletion = memo(TaskCompletionInner)
export default TaskCompletion
