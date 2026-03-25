import Chip from '@mui/material/Chip'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import { useRelativeTimer } from '../hooks/useRelativeTimer'
import { pv } from '../utils/cssVars'

interface DataFreshnessChipProps {
  lastFetchTime: number | null
  isTabVisible: boolean
}

export default function DataFreshnessChip({ lastFetchTime, isTabVisible }: DataFreshnessChipProps) {
  const elapsed = useRelativeTimer(lastFetchTime)

  let label: string
  let dotColor: string

  if (!isTabVisible) {
    label = 'Paused'
    dotColor = pv('status-pending')
  } else if (lastFetchTime === null) {
    label = 'Connecting...'
    dotColor = pv('status-pending')
  } else {
    const age = Date.now() - lastFetchTime
    if (age < 10_000) {
      label = `Live · ${elapsed}`
      dotColor = pv('status-done')
    } else if (age < 30_000) {
      label = `Live · ${elapsed}`
      dotColor = pv('secondary-main')
    } else {
      label = `Stale · ${elapsed}`
      dotColor = pv('status-failed')
    }
  }

  return (
    <Chip
      size="small"
      variant="outlined"
      label={label}
      icon={<FiberManualRecordIcon sx={{ fontSize: 8, color: dotColor }} />}
      aria-live="polite"
      sx={{
        height: 24,
        fontSize: '0.7rem',
        '& .MuiChip-icon': { ml: 0.5 },
      }}
    />
  )
}
