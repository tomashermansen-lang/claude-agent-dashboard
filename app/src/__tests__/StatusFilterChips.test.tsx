import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../theme'
import StatusFilterChips from '../components/StatusFilterChips'

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

describe('StatusFilterChips', () => {
  const counts = { wip: 3, blocked: 1, failed: 0 }

  it('renders four filter chips', () => {
    renderWithTheme(
      <StatusFilterChips filter="all" onChange={() => {}} counts={counts} totalTasks={10} />,
    )
    expect(screen.getByText(/all/i)).toBeInTheDocument()
    expect(screen.getByText(/working/i)).toBeInTheDocument()
    expect(screen.getByText(/blocked/i)).toBeInTheDocument()
    expect(screen.getByText(/failed/i)).toBeInTheDocument()
  })

  it('calls onChange when chip is clicked', () => {
    const onChange = vi.fn()
    renderWithTheme(
      <StatusFilterChips filter="all" onChange={onChange} counts={counts} totalTasks={10} />,
    )
    fireEvent.click(screen.getByText(/working/i))
    expect(onChange).toHaveBeenCalledWith('wip')
  })

  it('shows counts in labels', () => {
    renderWithTheme(
      <StatusFilterChips filter="all" onChange={() => {}} counts={counts} totalTasks={10} />,
    )
    expect(screen.getByText(/all 10/i)).toBeInTheDocument()
    expect(screen.getByText(/working 3/i)).toBeInTheDocument()
  })
})
