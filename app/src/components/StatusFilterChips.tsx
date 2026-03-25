import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import CheckIcon from '@mui/icons-material/Check'
import type { TaskStatusFilter } from '../types'

interface StatusFilterChipsProps {
  filter: TaskStatusFilter
  onChange: (filter: TaskStatusFilter) => void
  counts: { wip: number; blocked: number; failed: number }
  totalTasks: number
}

const FILTERS: { key: TaskStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'wip', label: 'Working' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'failed', label: 'Failed' },
]

export default function StatusFilterChips({ filter, onChange, counts, totalTasks }: StatusFilterChipsProps) {
  return (
    <Stack direction="row" spacing={0.75}>
      {FILTERS.map(({ key, label }) => {
        const isActive = filter === key
        const count = key === 'all' ? totalTasks : counts[key]
        return (
          <Chip
            key={key}
            label={`${label} ${count}`}
            variant={isActive ? 'filled' : 'outlined'}
            icon={isActive ? <CheckIcon sx={{ fontSize: 14 }} /> : undefined}
            onClick={() => onChange(key)}
            disabled={key === 'failed' && counts.failed === 0}
            size="small"
            sx={{
              height: 28,
              fontSize: '0.7rem',
              fontWeight: 500,
              '& .MuiChip-icon': { fontSize: 14 },
            }}
          />
        )
      })}
    </Stack>
  )
}
