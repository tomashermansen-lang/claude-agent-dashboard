import { Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { memo, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { SubagentUtilizationMetrics } from '../../types'
import MetricCard from './MetricCard'

interface SubagentUtilProps {
  data: SubagentUtilizationMetrics
}

function SubagentUtilInner({ data }: SubagentUtilProps) {
  const theme = useTheme()
  const et = theme.palette.eventType
  const pieColors = useMemo(() => [et.subagent, et.tool, et.session, et.notification, et.error], [et])

  const typeData = Object.entries(data.by_type).map(([name, value]) => ({ name, value }))

  const avgDuration = data.durations.length > 0
    ? data.durations.reduce((sum, d) => sum + d.duration_s, 0) / data.durations.length
    : 0

  return (
    <MetricCard
      title="Subagent Utilization"
      isEmpty={data.total_spawned === 0}
      emptyMessage="No subagent activity"
    >
      <Typography variant="headlineSmall" gutterBottom>{data.total_spawned}</Typography>
      <Typography variant="labelMedium" color="text.secondary" gutterBottom>
        Spawned
      </Typography>
      {typeData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={typeData} dataKey="value" nameKey="name" outerRadius={60} label>
              {typeData.map((entry, i) => (
                <Cell key={entry.name} fill={pieColors[i % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
      <Typography variant="titleMedium">Peak concurrent: {data.peak_concurrent}</Typography>
      {avgDuration > 0 && (
        <Typography variant="titleMedium">Avg duration: {Math.round(avgDuration)}s</Typography>
      )}
      {data.running.length > 0 && (
        <Typography variant="body2" color="warning.main" mt={1}>
          {data.running.length} subagent(s) still running
        </Typography>
      )}
    </MetricCard>
  )
}

const SubagentUtil = memo(SubagentUtilInner)
export default SubagentUtil
