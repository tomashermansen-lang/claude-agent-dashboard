import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../theme'
import DataFreshnessChip from '../components/DataFreshnessChip'

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

describe('DataFreshnessChip', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shows Connecting when lastFetchTime is null', () => {
    renderWithTheme(<DataFreshnessChip lastFetchTime={null} isTabVisible={true} />)
    expect(screen.getByText(/connecting/i)).toBeInTheDocument()
  })

  it('shows Paused when tab is not visible', () => {
    const now = Date.now()
    vi.setSystemTime(now)
    renderWithTheme(<DataFreshnessChip lastFetchTime={now} isTabVisible={false} />)
    expect(screen.getByText(/paused/i)).toBeInTheDocument()
  })

  it('shows Live when data is fresh', () => {
    const now = Date.now()
    vi.setSystemTime(now)
    renderWithTheme(<DataFreshnessChip lastFetchTime={now - 3000} isTabVisible={true} />)
    expect(screen.getByText(/live/i)).toBeInTheDocument()
  })

  it('shows Stale when data is old', () => {
    const now = Date.now()
    vi.setSystemTime(now)
    renderWithTheme(<DataFreshnessChip lastFetchTime={now - 35000} isTabVisible={true} />)
    expect(screen.getByText(/stale/i)).toBeInTheDocument()
  })
})
