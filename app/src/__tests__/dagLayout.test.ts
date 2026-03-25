import { describe, it, expect } from 'vitest'
import { buildTreeLayout, collapseCompletedChains, NODE_W, NODE_H, GAP_X, GAP_Y } from '../utils/dagLayout'
import type { Task } from '../types'

function task(id: string, status: string = 'pending', depends: string[] = []): Task {
  return { id, name: id, status: status as Task['status'], depends }
}

describe('buildTreeLayout', () => {
  it('returns empty result for no tasks', () => {
    const result = buildTreeLayout([])
    expect(result.nodes.size).toBe(0)
    expect(result.maxCol).toBe(0)
  })

  it('assigns col 0 to root tasks', () => {
    const result = buildTreeLayout([task('a'), task('b')])
    expect(result.nodes.get('a')!.col).toBe(0)
    expect(result.nodes.get('b')!.col).toBe(0)
  })

  it('assigns sequential columns for linear dependencies', () => {
    const result = buildTreeLayout([
      task('a'),
      task('b', 'pending', ['a']),
      task('c', 'pending', ['b']),
    ])
    expect(result.nodes.get('a')!.col).toBe(0)
    expect(result.nodes.get('b')!.col).toBe(1)
    expect(result.nodes.get('c')!.col).toBe(2)
    expect(result.maxCol).toBe(2)
  })

  it('assigns rows within the same column', () => {
    const result = buildTreeLayout([task('a'), task('b'), task('c')])
    const rows = [
      result.nodes.get('a')!.row,
      result.nodes.get('b')!.row,
      result.nodes.get('c')!.row,
    ]
    expect(new Set(rows).size).toBe(3)
  })

  it('tracks children references', () => {
    const result = buildTreeLayout([task('a'), task('b', 'pending', ['a'])])
    expect(result.nodes.get('a')!.children).toContain('b')
  })

  it('places isolated tasks at col 0 on their own rows below connected tasks', () => {
    // db-indexes is isolated (no deps, nothing depends on it)
    // absence-aware-capacity → two-layer-allocation is a connected chain
    const result = buildTreeLayout([
      task('absence-aware-capacity'),
      task('two-layer-allocation', 'pending', ['absence-aware-capacity']),
      task('db-indexes'),
    ])
    expect(result.nodes.get('absence-aware-capacity')!.col).toBe(0)
    expect(result.nodes.get('absence-aware-capacity')!.row).toBe(0)
    expect(result.nodes.get('two-layer-allocation')!.col).toBe(1)
    // db-indexes stays at col 0 but on its own row below connected tasks
    expect(result.nodes.get('db-indexes')!.col).toBe(0)
    expect(result.nodes.get('db-indexes')!.row).toBeGreaterThan(
      result.nodes.get('absence-aware-capacity')!.row,
    )
  })

  it('keeps all-independent tasks at col 0', () => {
    // When ALL tasks are independent (all isolated), keep at col 0
    const result = buildTreeLayout([task('a'), task('b'), task('c')])
    expect(result.nodes.get('a')!.col).toBe(0)
    expect(result.nodes.get('b')!.col).toBe(0)
    expect(result.nodes.get('c')!.col).toBe(0)
  })
})

describe('collapseCompletedChains', () => {
  it('does not collapse chains shorter than 3', () => {
    const { nodes } = buildTreeLayout([
      task('a', 'done'),
      task('b', 'done', ['a']),
    ])
    const result = collapseCompletedChains(nodes, 1)
    expect(result.chains.size).toBe(0)
    expect(result.nodes.size).toBe(2)
  })

  it('collapses a chain of 3+ done nodes into a summary', () => {
    const { nodes, maxCol } = buildTreeLayout([
      task('a', 'done'),
      task('b', 'done', ['a']),
      task('c', 'done', ['b']),
    ])
    const result = collapseCompletedChains(nodes, maxCol)
    expect(result.chains.size).toBe(1)
    const chain = result.chains.values().next().value!
    expect(chain.count).toBe(3)
    expect(chain.names).toEqual(['a', 'b', 'c'])
  })
})

describe('constants', () => {
  it('exports layout constants', () => {
    expect(NODE_W).toBe(240)
    expect(NODE_H).toBe(48)
    expect(GAP_X).toBe(28)
    expect(GAP_Y).toBe(10)
  })
})
