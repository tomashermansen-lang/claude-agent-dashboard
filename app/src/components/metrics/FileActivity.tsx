import {
  Alert, Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography,
} from '@mui/material'
import { memo } from 'react'
import type { FileActivityMetrics } from '../../types'
import MetricCard from './MetricCard'

interface FileActivityProps {
  data: FileActivityMetrics
}

function FileActivityInner({ data }: FileActivityProps) {
  if (!data.has_fp_data) {
    return (
      <MetricCard title="File Activity" isEmpty emptyMessage="">
        <Alert severity="info" variant="standard">
          No file activity data available — hook update required.
        </Alert>
      </MetricCard>
    )
  }

  return (
    <MetricCard
      title="File Activity"
      isEmpty={data.files.length === 0}
      emptyMessage="No file activity"
    >
      {data.conflicts.slice(0, 5).map(c => (
        <Alert key={c.path} severity="warning" sx={{ mb: 1 }} aria-live="assertive">
          {c.path.split('/').pop()} edited by {c.sessions.length} sessions
        </Alert>
      ))}
      {data.conflicts.length > 5 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          +{data.conflicts.length - 5} more file conflicts
        </Typography>
      )}
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table size="small" aria-label="File activity">
          <TableHead>
            <TableRow>
              <TableCell>File</TableCell>
              <TableCell>Sessions</TableCell>
              <TableCell>Access</TableCell>
              <TableCell>Last Activity</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.files.map(f => (
              <TableRow key={f.path} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {f.path}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.sessions.map(s => s.slice(0, 7)).join(', ')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={f.access === 'edit' ? 'Edit' : 'Read'}
                    color={f.access === 'edit' ? 'warning' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="caption">
                    {new Date(f.last_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="body2" color="text.secondary" mt={1}>
        {data.summary.total} files ({data.summary.edited} edited, {data.summary.read_only} read-only)
      </Typography>
    </MetricCard>
  )
}

const FileActivity = memo(FileActivityInner)
export default FileActivity
