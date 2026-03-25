import { Typography } from '@mui/material'
import { memo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import type { ToolUsageMetrics } from '../../types'
import MetricCard from './MetricCard'

interface ToolUsageProps {
  data: ToolUsageMetrics
  selectedSid: string | 'all'
}

function ToolUsageInner({ data, selectedSid }: ToolUsageProps) {
  const chartData = Object.entries(data.by_tool)
    .sort(([, a], [, b]) => b - a)
    .map(([tool, count]) => ({ tool, count }))

  const rate = selectedSid !== 'all'
    ? data.by_session[selectedSid]?.rate
    : undefined

  return (
    <MetricCard
      title="Tool Usage"
      isEmpty={data.total === 0}
      emptyMessage="No tool usage data available"
    >
      <ResponsiveContainer width="100%" height={Math.max(150, chartData.length * 28)}>
        <BarChart layout="vertical" data={chartData} margin={{ left: 0, right: 16 }}>
          <XAxis type="number" />
          <YAxis type="category" dataKey="tool" width={70} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="count" fill="var(--mui-palette-info-main)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Typography variant="labelMedium" color="text.secondary">
        Most used: {data.most_used || '—'}
      </Typography>
      {rate !== undefined && (
        <Typography variant="labelMedium" color="text.secondary">
          {rate} calls/min
        </Typography>
      )}
    </MetricCard>
  )
}

const ToolUsage = memo(ToolUsageInner)
export default ToolUsage
