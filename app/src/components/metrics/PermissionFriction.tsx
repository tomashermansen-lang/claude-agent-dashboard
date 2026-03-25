import { Alert, Chip, List, ListItem, ListItemIcon, ListItemText, Stack, Typography } from '@mui/material'
import BlockIcon from '@mui/icons-material/Block'
import { memo, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { PermissionFrictionMetrics } from '../../types'
import { formatBlockedDuration } from '../../utils/time'
import MetricCard from './MetricCard'

interface PermissionFrictionProps {
  data: PermissionFrictionMetrics
  selectedSid: string | 'all'
}

function PermissionFrictionInner({ data, selectedSid }: PermissionFrictionProps) {
  const totalBlocked = selectedSid !== 'all'
    ? data.by_session[selectedSid]?.blocked_s ?? 0
    : data.blocked_durations.reduce((sum, d) => sum + d.duration_s, 0)

  // Collect all modes across tools for consistent bar stacking
  const { chartData, allModes } = useMemo(() => {
    const byToolMode = data.by_tool_mode ?? {}
    const modes = new Set<string>()

    for (const toolModes of Object.values(byToolMode)) {
      for (const mode of Object.keys(toolModes)) {
        modes.add(mode)
      }
    }
    const modeList = Array.from(modes).sort()

    const rows = Object.entries(data.by_tool)
      .sort(([, a], [, b]) => b - a)
      .map(([tool, total]) => {
        const row: Record<string, string | number> = { tool, total }
        const toolModes = byToolMode[tool] ?? {}
        for (const mode of modeList) {
          row[mode] = toolModes[mode] ?? 0
        }
        if (modeList.length === 0) {
          row['unknown'] = total
        }
        return row
      })

    return { chartData: rows, allModes: modeList.length > 0 ? modeList : ['unknown'] }
  }, [data.by_tool, data.by_tool_mode])

  // Mode colors
  const modeColors: Record<string, string> = {
    default: 'var(--mui-palette-warning-main)',
    acceptEdits: 'var(--mui-palette-info-main)',
    plan: 'var(--mui-palette-success-main)',
    dontAsk: 'var(--mui-palette-text-secondary)',
    bypassPermissions: 'var(--mui-palette-error-main)',
    unknown: 'var(--mui-palette-warning-main)',
  }

  const modeData = Object.entries(data.mode_distribution)
  const timeline = data.timeline ?? []

  // Summarize msg for display: extract the meaningful part
  function summarizeMsg(msg: string, tool: string): string {
    if (!msg) return tool
    try {
      const parsed = JSON.parse(msg)
      if (parsed.command) return parsed.command.slice(0, 60)
      if (parsed.file_path) return parsed.file_path.replace(/^.*\//, '')
      return msg.slice(0, 60)
    } catch {
      return msg.slice(0, 60)
    }
  }

  return (
    <MetricCard
      title="Permission Friction"
      isEmpty={data.total_prompts === 0}
      emptyMessage="No permission prompts"
    >
      <Typography variant="headlineSmall" gutterBottom>{data.total_prompts}</Typography>
      <Typography variant="labelMedium" color="text.secondary" gutterBottom>
        Total prompts
      </Typography>
      {totalBlocked > 0 && (
        <Typography variant="titleMedium" color="warning.main" gutterBottom>
          Blocked: {formatBlockedDuration(totalBlocked)}
        </Typography>
      )}
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={Math.max(80, chartData.length * 32)}>
          <BarChart layout="vertical" data={chartData} margin={{ left: 0, right: 16 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="tool" width={70} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value, name) => [value, name]}
              labelFormatter={(label) => String(label)}
            />
            {allModes.length > 1 && (
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            )}
            {allModes.map((mode, i) => (
              <Bar
                key={mode}
                dataKey={mode}
                stackId="modes"
                fill={modeColors[mode] ?? `hsl(${i * 60 + 30}, 60%, 50%)`}
                radius={i === allModes.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      {timeline.length > 0 && (
        <List dense sx={{ mt: 1 }}>
          {timeline.slice(-10).reverse().map((e, i) => (
            <ListItem key={`${e.sid}-${e.ts}-${i}`} disablePadding sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 28 }}>
                <BlockIcon fontSize="small" color="warning" />
              </ListItemIcon>
              <ListItemText
                primary={summarizeMsg(e.msg, e.tool)}
                secondary={`${e.tool} · ${e.mode} · ${new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItem>
          ))}
        </List>
      )}
      {modeData.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
          {modeData.map(([mode, count]) => (
            <Chip key={mode} size="small" label={`${mode}: ${count}`} variant="outlined" />
          ))}
        </Stack>
      )}
      {!data.has_tuid_data && (
        <Alert severity="info" variant="standard" sx={{ mt: 1 }}>
          Duration estimates require hook v2 data.
        </Alert>
      )}
    </MetricCard>
  )
}

const PermissionFriction = memo(PermissionFrictionInner)
export default PermissionFriction
