import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../theme'
import MetricCard from '../components/metrics/MetricCard'

function renderCard(props: { title: string; isEmpty: boolean; emptyMessage: string; children?: React.ReactNode }) {
  return render(
    <ThemeProvider theme={theme}>
      <MetricCard {...props}>
        {props.children ?? <span>Content</span>}
      </MetricCard>
    </ThemeProvider>,
  )
}

describe('MetricCard', () => {
  it('renders title and children when not empty', () => {
    renderCard({ title: 'Tool Usage', isEmpty: false, emptyMessage: 'No data' })
    expect(screen.getByText('Tool Usage')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders empty message when isEmpty is true', () => {
    renderCard({ title: 'Tool Usage', isEmpty: true, emptyMessage: 'No data' })
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('has role=region with aria-labelledby', () => {
    renderCard({ title: 'Error Tracking', isEmpty: false, emptyMessage: '' })
    const region = screen.getByRole('region')
    expect(region).toBeInTheDocument()
    const titleId = region.getAttribute('aria-labelledby')
    expect(titleId).toBeTruthy()
    const titleEl = document.getElementById(titleId!)
    expect(titleEl?.textContent).toBe('Error Tracking')
  })
})
