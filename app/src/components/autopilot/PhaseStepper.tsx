import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import type { AutopilotPhase, AutopilotPhaseStatus } from '../../types'
import { pv } from '../../utils/cssVars'

const reducedMotionQuery = '@media (prefers-reduced-motion: reduce)'

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatCost(cost: number | null): string {
  if (cost === null) return '—'
  return `$${cost.toFixed(2)}`
}

function PhaseIcon({ status, size = 14 }: { status: AutopilotPhaseStatus; size?: number }) {
  const s = size + 4
  if (status === 'completed') return <CheckCircleIcon sx={{ color: pv('status-done'), fontSize: s }} />
  if (status === 'failed') return <ErrorIcon sx={{ color: pv('status-failed'), fontSize: s }} />
  if (status === 'running')
    return (
      <Box sx={{ width: s, height: s, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FiberManualRecordIcon
          sx={{
            color: pv('status-wip'),
            fontSize: s - 2,
            animation: 'autopilotPulse 2s ease-in-out infinite',
            '@keyframes autopilotPulse': {
              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
              '50%': { opacity: 0.4, transform: 'scale(0.8)' },
            },
            [reducedMotionQuery]: { animation: 'none' },
          }}
        />
      </Box>
    )
  return <RadioButtonUncheckedIcon sx={{ color: pv('status-pending'), fontSize: s }} />
}

const STATUS_PREFIX: Record<AutopilotPhaseStatus, string> = {
  completed: '✓',
  running: '●',
  pending: '○',
  failed: '✗',
}

/* ═══ Compact Mode (horizontal, in card) ═══ */

function CompactStepper({ phases }: { phases: AutopilotPhase[] }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.25 }}>
      {phases.map((phase, i) => (
        <Box key={phase.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {i > 0 && (
            <Typography variant="labelSmall" color="text.secondary" sx={{ mx: 0.25 }}>→</Typography>
          )}
          <Typography
            variant="labelSmall"
            aria-label={`${phase.name} — ${phase.status}${phase.duration_s ? ` in ${formatDuration(phase.duration_s)}` : ''}`}
            sx={{
              color: phase.status === 'running' ? pv('status-wip')
                : phase.status === 'failed' ? pv('status-failed')
                : phase.status === 'completed' ? pv('status-done')
                : 'text.secondary',
              fontWeight: phase.status === 'running' ? 500 : 400,
            }}
          >
            {STATUS_PREFIX[phase.status]} {phase.name}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

/* ═══ Full Mode (vertical, in detail sidebar) ═══ */

interface FullStepperProps {
  phases: AutopilotPhase[]
}

function FullStepper({ phases }: FullStepperProps) {
  const totalDuration = phases.reduce((acc, p) => acc + (p.duration_s ?? 0), 0)
  const phaseCosts = phases.filter((p) => p.cost !== null)
  const totalCost = phaseCosts.length > 0 ? phaseCosts.reduce((acc, p) => acc + (p.cost ?? 0), 0) : null

  return (
    <Stack spacing={0}>
      {phases.map((phase) => (
        <Box
          key={phase.name}
          aria-label={`${phase.name} — ${phase.status}${phase.duration_s ? ` in ${formatDuration(phase.duration_s)}` : ''}`}
          sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box sx={{ pt: 0.25 }}>
            <PhaseIcon status={phase.status} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="titleSmall" sx={{ display: 'block' }}>{phase.name}</Typography>
            {(phase.duration_s !== null || phase.cost !== null) && (
              <Typography variant="labelSmall" color="text.secondary" sx={{ display: 'block' }}>
                {[
                  phase.duration_s !== null ? formatDuration(phase.duration_s) : null,
                  phase.cost !== null ? formatCost(phase.cost) : null,
                ].filter(Boolean).join(' · ')}
              </Typography>
            )}
          </Box>
        </Box>
      ))}

      {/* Total row */}
      <Box sx={{ pt: 1.5, borderTop: '2px solid', borderColor: 'divider' }}>
        <Typography variant="titleSmall">Total</Typography>
        <Typography variant="labelMedium" sx={{ display: 'block' }}>{formatDuration(totalDuration)}</Typography>
        <Typography variant="labelMedium" sx={{ display: 'block' }}>{formatCost(totalCost)}</Typography>
      </Box>
    </Stack>
  )
}

/* ═══ Exported Component ═══ */

interface PhaseStepperProps {
  phases: AutopilotPhase[]
  mode?: 'compact' | 'full'
}

export default function PhaseStepper({ phases, mode = 'compact' }: PhaseStepperProps) {
  if (mode === 'full') return <FullStepper phases={phases} />
  return <CompactStepper phases={phases} />
}
