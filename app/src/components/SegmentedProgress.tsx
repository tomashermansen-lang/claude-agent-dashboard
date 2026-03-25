import Box from '@mui/material/Box'
import type { Task } from '../types'
import { pv } from '../utils/cssVars'

interface SegmentedProgressProps {
  tasks: Task[]
  height?: number
}

export default function SegmentedProgress({ tasks, height = 8 }: SegmentedProgressProps) {
  return (
    <Box
      data-testid="segmented-progress"
      sx={{
        display: 'flex',
        borderRadius: height / 2 + 'px',
        overflow: 'hidden',
        height,
        gap: '1px',
        bgcolor: 'background.default',
      }}
    >
      {tasks.map((task) => (
        <Box
          key={task.id}
          data-testid="segment"
          sx={{
            flex: 1,
            minWidth: 3,
            bgcolor: pv(`status-${task.status}`),
          }}
        />
      ))}
    </Box>
  )
}
