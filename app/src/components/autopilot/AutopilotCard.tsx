import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { AutopilotSession, AutopilotSessionStatus } from '../../types'
import { pv } from '../../utils/cssVars'
import PhaseStepper from './PhaseStepper'

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const STATUS_CHIP_SX: Record<AutopilotSessionStatus, { bgcolor: string; color: string }> = {
  running: { bgcolor: pv('statusContainer-wip'), color: pv('onStatusContainer-wip') },
  completed: { bgcolor: pv('statusContainer-done'), color: pv('onStatusContainer-done') },
  failed: { bgcolor: pv('statusContainer-failed'), color: pv('onStatusContainer-failed') },
}

interface AutopilotCardProps {
  session: AutopilotSession
  selected: boolean
  onSelect: () => void
}

export default function AutopilotCard({ session, selected, onSelect }: AutopilotCardProps) {
  const chipSx = STATUS_CHIP_SX[session.status]

  return (
    <Paper
      role="option"
      aria-selected={selected}
      aria-label={`${session.task} — ${session.project ?? 'unknown'} — ${session.status}`}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      elevation={0}
      sx={{
        p: 1.5,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'surface1' : 'transparent',
        '&:hover': {
          borderColor: 'primary.light',
          transition: 'var(--motion-short4) var(--motion-emphasized)',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
        <Typography variant="titleSmall" sx={{ fontWeight: 500 }}>
          {session.task}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="labelSmall" color="text.secondary">
            {session.project ?? ''}
          </Typography>
          <Chip
            label={session.status}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.6rem',
              fontWeight: 600,
              ...chipSx,
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        </Box>
      </Box>

      <PhaseStepper phases={session.phases} mode="compact" />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
        <Typography variant="labelSmall" color="text.secondary">
          {formatElapsed(session.elapsed_s)}
        </Typography>
        <Typography variant="labelSmall" color="text.secondary">
          {session.cost !== null ? `$${session.cost.toFixed(2)}` : '—'}
        </Typography>
      </Box>
    </Paper>
  )
}
