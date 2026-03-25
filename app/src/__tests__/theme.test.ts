import { describe, it, expect } from 'vitest'
import theme from '../theme'

describe('theme', () => {
  it('defines all 6 status colors in palette', () => {
    expect(theme.palette.status).toBeDefined()
    expect(theme.palette.status.pending).toBeDefined()
    expect(theme.palette.status.wip).toBeDefined()
    expect(theme.palette.status.done).toBeDefined()
    expect(theme.palette.status.failed).toBeDefined()
    expect(theme.palette.status.skipped).toBeDefined()
    expect(theme.palette.status.blocked).toBeDefined()
  })

  it('uses Inter font family', () => {
    expect(theme.typography.fontFamily).toContain('Inter')
  })

  it('has uniform border radius (8) matching chip rounding', () => {
    expect(theme.shape.borderRadius).toBe(8)
  })

  it('theme palette has mode defined', () => {
    expect(theme.palette.mode).toBeDefined()
  })

  /* M3 tonal surface tokens */
  it('defines tonal surface palette tokens', () => {
    expect(theme.palette.surface1).toBeDefined()
    expect(theme.palette.surface2).toBeDefined()
    expect(theme.palette.surface3).toBeDefined()
    expect(theme.palette.surfaceVariant).toBeDefined()
    expect(theme.palette.outline).toBeDefined()
    expect(theme.palette.outlineVariant).toBeDefined()
  })

  /* Container color roles */
  it('defines statusContainer palette', () => {
    const sc = theme.palette.statusContainer
    expect(sc).toBeDefined()
    expect(sc.done).toBeDefined()
    expect(sc.wip).toBeDefined()
    expect(sc.failed).toBeDefined()
    expect(sc.pending).toBeDefined()
    expect(sc.skipped).toBeDefined()
    expect(sc.blocked).toBeDefined()
  })

  it('defines onStatusContainer palette', () => {
    const osc = theme.palette.onStatusContainer
    expect(osc).toBeDefined()
    expect(osc.done).toBeDefined()
    expect(osc.wip).toBeDefined()
    expect(osc.failed).toBeDefined()
    expect(osc.pending).toBeDefined()
    expect(osc.skipped).toBeDefined()
    expect(osc.blocked).toBeDefined()
  })

  /* M3 typography weights: 400-500 instead of 600-700 */
  it('uses M3 lighter typography weights', () => {
    expect(theme.typography.h4.fontWeight).toBeLessThanOrEqual(500)
    expect(theme.typography.h5.fontWeight).toBeLessThanOrEqual(500)
    expect(theme.typography.h6.fontWeight).toBeLessThanOrEqual(500)
  })

  /* M3 custom variants */
  it('defines M3 custom typography variants', () => {
    expect(theme.typography.displayMedium).toBeDefined()
    expect(theme.typography.headlineSmall).toBeDefined()
    expect(theme.typography.titleLarge).toBeDefined()
    expect(theme.typography.titleMedium).toBeDefined()
    expect(theme.typography.titleSmall).toBeDefined()
    expect(theme.typography.labelLarge).toBeDefined()
    expect(theme.typography.labelMedium).toBeDefined()
    expect(theme.typography.labelSmall).toBeDefined()
  })

  /* Motion tokens via CSS variables */
  it('defines motion token CSS variables in CssBaseline', () => {
    const baseline = theme.components?.MuiCssBaseline?.styleOverrides as Record<string, unknown>
    expect(baseline).toBeDefined()
    const root = baseline[':root'] as Record<string, string>
    expect(root['--motion-emphasized']).toBeDefined()
    expect(root['--motion-short4']).toBeDefined()
    expect(root['--motion-medium2']).toBeDefined()
  })
})
