import { Chip, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { memo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ScatterChart, Scatter, Legend } from 'recharts'
import type { ErrorTrackingMetrics } from '../../types'
import MetricCard from './MetricCard'

interface ErrorTrackingProps {
  data: ErrorTrackingMetrics
  selectedSid: string | 'all'
}

function ErrorTrackingInner({ data, selectedSid }: ErrorTrackingProps) {
  const isEmpty = data.total_errors === 0

  // Stacked bar data: per tool, failures vs interrupts
  const chartData = Object.entries(data.by_tool_detail ?? {})
    .sort(([, a], [, b]) => (b.failures + b.interrupts) - (a.failures + a.interrupts))
    .map(([tool, detail]) => ({
      tool,
      failures: detail.failures,
      interrupts: detail.interrupts,
    }))

  // Fallback: if backend hasn't been updated yet, use by_tool
  if (chartData.length === 0 && Object.keys(data.by_tool).length > 0) {
    Object.entries(data.by_tool)
      .sort(([, a], [, b]) => b - a)
      .forEach(([tool, count]) => chartData.push({ tool, failures: count, interrupts: 0 }))
  }

  const rate = selectedSid !== 'all'
    ? data.by_session[selectedSid]?.rate
    : undefined

  const overallRate = rate !== undefined
    ? `${rate}%`
    : data.total_errors > 0
      ? `${data.total_errors} errors`
      : undefined

  const timelineData = data.timeline.map(e => ({
    ts: new Date(e.ts).getTime(),
    y: 1,
    tool: e.tool,
    type: e.is_interrupt ? 'Interrupt' : 'Failure',
  }))

  return (
    <MetricCard
      title="Error Tracking"
      isEmpty={isEmpty}
      emptyMessage=""
    >
      {isEmpty ? (
        <Stack direction="row" alignItems="center" spacing={1} justifyContent="center" py={2}>
          <CheckCircleIcon color="success" fontSize="small" />
          <Typography variant="body2" color="text.secondary">No errors recorded</Typography>
        </Stack>
      ) : (
        <>
          {overallRate && (
            <Typography variant="headlineSmall" color="error.main" gutterBottom>
              {overallRate}
            </Typography>
          )}
          <Stack direction="row" spacing={1} mb={1}>
            <Chip size="small" label={`Failures: ${data.failures}`} color="error" variant="outlined" />
            <Chip size="small" label={`Interrupts: ${data.interrupts}`} variant="outlined" />
          </Stack>
          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={Math.max(80, chartData.length * 32)}>
              <BarChart layout="vertical" data={chartData} margin={{ left: 0, right: 16 }}>
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="tool" width={70} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) => [value, name === 'failures' ? 'Failures' : 'Interrupts']}
                  labelFormatter={(label) => String(label)}
                />
                <Legend
                  formatter={(value: string) => value === 'failures' ? 'Failures' : 'Interrupts'}
                  iconSize={10}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Bar dataKey="failures" stackId="errors" fill="var(--mui-palette-error-main)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="interrupts" stackId="errors" fill="var(--mui-palette-warning-main)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {timelineData.length > 0 && (
            <ResponsiveContainer width="100%" height={80}>
              <ScatterChart margin={{ left: 0, right: 16 }}>
                <XAxis
                  type="number"
                  dataKey="ts"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  tick={{ fontSize: 10 }}
                />
                <YAxis type="number" dataKey="y" hide />
                <Tooltip
                  labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
                  formatter={(_value, _name, entry) => {
                    const p = entry.payload as Record<string, string>
                    return [p.tool, p.type]
                  }}
                />
                <Scatter data={timelineData} fill="var(--mui-palette-error-main)" />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </MetricCard>
  )
}

const ErrorTracking = memo(ErrorTrackingInner)
export default ErrorTracking
