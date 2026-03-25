import { Card, CardContent, CardHeader, Typography } from '@mui/material'
import { memo, useId } from 'react'

interface MetricCardProps {
  title: string
  isEmpty: boolean
  emptyMessage: string
  children: React.ReactNode
}

function MetricCardInner({ title, isEmpty, emptyMessage, children }: MetricCardProps) {
  const titleId = useId()
  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader
        id={titleId}
        title={title}
        titleTypographyProps={{ variant: 'titleMedium' }}
        sx={{ pb: 0 }}
      />
      <CardContent>
        {isEmpty ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            {emptyMessage}
          </Typography>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

const MetricCard = memo(MetricCardInner)
export default MetricCard
