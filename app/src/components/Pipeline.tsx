import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect, Fragment } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import LinearProgress from '@mui/material/LinearProgress'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import LockIcon from '@mui/icons-material/Lock'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import type { Plan, Phase, Task, TaskStatus, TaskStatusFilter, Session, AutopilotSession } from '../types'
import SessionPanel from './SessionPanel'
import StatusFilterChips from './StatusFilterChips'
import { useHoverLink } from '../contexts/HoverLinkContext'
import { useAutopilots } from '../hooks/useAutopilots'
import { buildTreeLayout, NODE_W, NODE_H, GAP_X, GAP_Y } from '../utils/dagLayout'
import type { TreeNode } from '../utils/dagLayout'
import { phaseStatus, phaseProgress } from '../utils/phaseHelpers'
import { flattenTasks } from '../utils/planMetrics'
import { pv, pva } from '../utils/cssVars'


/* ═══ Helpers ═══ */

function isBlocked(task: Task, allTasks: Map<string, Task>): boolean {
  if (!task.depends || task.depends.length === 0) return false
  return task.depends.some((d) => {
    const dep = allTasks.get(d)
    return dep && dep.status !== 'done'
  })
}

const ACTIVE_SESSION_STATUSES = new Set(['working', 'needs_input', 'idle'])

function findSessionForTask(taskId: string, sessions: Session[], taskStatus?: TaskStatus): Session | undefined {
  return sessions.find((s) => {
    const feature = s.branch.split('/').pop() ?? ''
    if (feature !== taskId) return false
    // For pending tasks, only show active sessions — ended sessions are stale
    // (task was reset/rolled back but JSONL still has the old session)
    if (taskStatus === 'pending' && !ACTIVE_SESSION_STATUSES.has(s.status)) return false
    return true
  })
}

/* ═══ StatusDot ═══ */

const reducedMotionQuery = '@media (prefers-reduced-motion: reduce)'

function StatusDot({ status, size = 10 }: { status: TaskStatus; size?: number }) {
  const color = pv(`status-${status}`)
  const s = size + 4

  if (status === 'done') return <CheckCircleIcon sx={{ color, fontSize: s }} />
  if (status === 'failed') return <ErrorIcon sx={{ color, fontSize: s }} />
  if (status === 'skipped') return <RemoveCircleOutlineIcon sx={{ color, fontSize: s }} />
  if (status === 'wip')
    return (
      <Box sx={{ width: s, height: s, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FiberManualRecordIcon
          sx={{
            color,
            fontSize: s - 2,
            animation: 'pipelinePulse 2s ease-in-out infinite',
            '@keyframes pipelinePulse': {
              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
              '50%': { opacity: 0.4, transform: 'scale(0.8)' },
            },
            [reducedMotionQuery]: { animation: 'none' },
          }}
        />
      </Box>
    )
  return <RadioButtonUncheckedIcon sx={{ color, fontSize: s }} />
}

/* ═══ Session status → TaskStatus palette key (same mapping as SessionMonitor) ═══ */

const SESSION_TO_TASK_STATUS: Record<string, string> = {
  working: 'wip',
  needs_input: 'failed',
  idle: 'pending',
  completed: 'done',
  stopped: 'skipped',
  stale: 'skipped',
  closed: 'done',
}

const FLOW_LABELS: Record<string, string> = {
  started: 'Started', ba: 'BA', design: 'Design', plan: 'Plan',
  implement: 'Impl', manualtest: 'Test', qa: 'QA', done: 'Done',
}

/* ═══ Shared chip styling (matches SessionMonitor) ═══ */

const chipSx = (bgcolor: string, color: string, pulse?: boolean) => ({
  height: 20,
  fontSize: '0.6rem',
  fontWeight: 600,
  bgcolor,
  color,
  '& .MuiChip-label': { px: 0.75 },
  ...(pulse ? {
    animation: 'badgePulse 2.5s ease-in-out infinite',
    '@keyframes badgePulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
    [reducedMotionQuery]: { animation: 'none' },
  } : {}),
} as const)

/* ═══ Task node card (M3 styling) ═══ */

function TaskNodeCard({
  node, blocked, session, autopilotSession, onClick,
}: {
  node: TreeNode; blocked: boolean; session?: Session; autopilotSession?: AutopilotSession; onClick: () => void
}) {
  const { hoveredSessionBranch, setHoveredTask } = useHoverLink()
  const { task } = node

  const statusPath = `status-${task.status}`
  const color = pv(statusPath)

  // Session chip: map session.status → task palette key, same as SessionMonitor
  const sessionTaskStatus = session ? SESSION_TO_TASK_STATUS[session.status] : undefined
  const sessionLabel = session ? session.status.replace('_', ' ') : undefined

  // Cross-panel: highlight when a session with matching branch feature is hovered
  const sessionFeature = hoveredSessionBranch?.split('/').pop() ?? ''
  const isLinkedHighlight = sessionFeature !== '' && sessionFeature === task.id

  // Collect chips for row 2
  const chips: { label: string; bg: string; fg: string; pulse?: boolean }[] = []
  if (task.status === 'failed') {
    chips.push({ label: 'fix', bg: pv('statusContainer-failed'), fg: pv('onStatusContainer-failed') })
  }
  if (blocked && task.status === 'pending') {
    chips.push({ label: 'blocked', bg: pva('warning-main', 0.12), fg: pv('warning-main') })
  }
  if (task.status === 'done' && !sessionTaskStatus) {
    chips.push({ label: 'completed', bg: pv('statusContainer-done'), fg: pv('onStatusContainer-done') })
  }
  // Suppress transient session chips (needs_input, working) when autopilot is running —
  // autopilot auto-approves checkpoints, so these are just noise
  const suppressSessionChip = autopilotSession?.status === 'running'
  if (sessionTaskStatus && sessionLabel && !suppressSessionChip) {
    chips.push({
      label: sessionLabel,
      bg: pv(`statusContainer-${sessionTaskStatus}`),
      fg: pv(`onStatusContainer-${sessionTaskStatus}`),
      pulse: session?.status === 'needs_input',
    })
  }

  return (
    <Box
      data-node-id={task.id}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHoveredTask(task.id)}
      onMouseLeave={() => setHoveredTask(null)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      sx={{
        position: 'absolute',
        width: NODE_W,
        height: NODE_H,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 0.25,
        px: 1,
        borderRadius: 1,
        border: isLinkedHighlight ? '1.5px solid' : '1px solid',
        borderColor: isLinkedHighlight
          ? pv('primary-main')
          : task.status === 'wip' ? pva(statusPath, 0.5) : pv('outlineVariant'),
        bgcolor: pv('surface1'),
        cursor: 'pointer',
        transition: `all var(--motion-short4, 200ms) var(--motion-emphasized, cubic-bezier(0.2, 0, 0, 1))`,
        boxShadow: isLinkedHighlight
          ? `0 0 0 2px ${pva('primary-main', 0.3)}, 0 4px 12px ${pva('primary-main', 0.15)}`
          : task.status === 'wip'
            ? `0 0 0 1px ${pva(statusPath, 0.15)}, 0 2px 8px ${pva(statusPath, 0.12)}`
            : `0 1px 2px ${pva('text-primary', 0.04)}`,
        '&:hover': {
          borderColor: pva(statusPath, 0.6),
          boxShadow: `0 4px 12px ${pva(statusPath, 0.16)}`,
          transform: 'translateY(-1px)',
          [reducedMotionQuery]: { transform: 'none' },
        },
        '&:active': {
          transform: 'translateY(0)',
          [reducedMotionQuery]: { transform: 'none' },
        },
        '&:focus-visible': {
          outline: `2px solid ${pv('primary-main')}`,
          outlineOffset: 2,
        },
        ...(task.status === 'wip' ? {
          animation: 'nodeGlow 3s ease-in-out infinite',
          '@keyframes nodeGlow': {
            '0%, 100%': { boxShadow: `0 0 0 1px ${pva(statusPath, 0.15)}, 0 2px 8px ${pva(statusPath, 0.12)}` },
            '50%': { boxShadow: `0 0 0 1.5px ${pva(statusPath, 0.25)}, 0 2px 12px ${pva(statusPath, 0.2)}` },
          },
          [reducedMotionQuery]: { animation: 'none' },
        } : {}),
      }}
    >
      {/* Row 1: status + name + autopilot indicator */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
        <StatusDot status={task.status} size={6} />
        {(task.autopilot || autopilotSession) && (
          <Tooltip title={autopilotSession ? `Autopilot ${autopilotSession.status}` : 'Autopilot eligible'} enterDelay={300}>
            <SmartToyIcon sx={{
              fontSize: 14,
              color: autopilotSession ? pv('status-wip') : 'text.secondary',
              opacity: task.status === 'done' && !autopilotSession ? 0.5 : 0.85,
              ...(autopilotSession?.status === 'running' ? {
                animation: 'robotPulse 2s ease-in-out infinite',
                '@keyframes robotPulse': { '0%,100%': { opacity: 0.85 }, '50%': { opacity: 0.4 } },
                [reducedMotionQuery]: { animation: 'none' },
              } : {}),
            }} />
          </Tooltip>
        )}
        <Tooltip title={task.name} enterDelay={500}>
          <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: '0.65rem', fontWeight: task.status === 'wip' ? 600 : 400, color: task.status === 'done' ? 'text.secondary' : 'text.primary', lineHeight: 1.3 }}>
            {task.name}
          </Typography>
        </Tooltip>
      </Box>

      {/* Row 2: chips + flow progress (always present, fixed position) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, pl: 1.5, minHeight: 20 }}>
        {chips.map((c) => (
          <Chip key={c.label} label={c.label} size="small" sx={chipSx(c.bg, c.fg, c.pulse)} />
        ))}
        {session?.flow && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, flex: 1, ml: chips.length > 0 ? 0.5 : 0 }}>
            <Typography variant="caption" sx={{ fontSize: '0.48rem', fontWeight: 600, color: 'text.secondary', minWidth: 20 }}>
              {FLOW_LABELS[session.flow.phase] ?? session.flow.phase}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={((session.flow.phase_index + 1) / session.flow.total_phases) * 100}
              sx={{ flex: 1, height: 2.5, borderRadius: 1, bgcolor: pva(statusPath, 0.1), '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 } }}
            />
          </Box>
        )}
      </Box>
    </Box>
  )
}

/* ═══ Orthogonal path with rounded corners (matches box border-radius) ═══ */

function orthogonalPath(x1: number, y1: number, x2: number, y2: number, r: number = 8, viaX?: number): string {
  const dy = y2 - y1
  if (Math.abs(dy) < 1) return `M ${x1} ${y1} H ${x2}`
  const mx = viaX ?? (x1 + x2) / 2
  const cr = Math.min(r, Math.abs(dy) / 2, Math.abs(mx - x1), Math.abs(x2 - mx))
  if (cr < 0.5) return `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`
  const sign = dy > 0 ? 1 : -1
  return `M ${x1} ${y1} H ${mx - cr} Q ${mx} ${y1}, ${mx} ${y1 + sign * cr} V ${y2 - sign * cr} Q ${mx} ${y2}, ${mx + cr} ${y2} H ${x2}`
}

/* ═══ SVG connectors: orthogonal lines ═══ */

function TreeConnectors({
  nodes, containerRef,
}: {
  nodes: Map<string, TreeNode>; containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; status: TaskStatus; viaX?: number }[]>([])

  const measure = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const newLines: typeof lines = []

    // Group lines by child to detect multi-parent convergence
    const linesByChild = new Map<string, typeof newLines>()
    for (const [, node] of nodes) {
      for (const childId of node.children) {
        const pEl = container.querySelector(`[data-node-id="${node.task.id}"]`)
        const cEl = container.querySelector(`[data-node-id="${childId}"]`)
        if (!pEl || !cEl) continue
        const pR = pEl.getBoundingClientRect()
        const cR = cEl.getBoundingClientRect()
        const line = {
          x1: pR.right - rect.left,
          y1: pR.top + pR.height / 2 - rect.top,
          x2: cR.left - rect.left,
          y2: cR.top + cR.height / 2 - rect.top,
          status: node.task.status,
        }
        const group = linesByChild.get(childId) ?? []
        group.push(line)
        linesByChild.set(childId, group)
      }
    }
    // For multi-parent children, set a convergence X so lines don't overlap
    for (const [, group] of linesByChild) {
      if (group.length > 1) {
        const convX = group[0].x2 - GAP_X / 2
        for (const l of group) (l as typeof l & { viaX?: number }).viaX = convX
      }
      newLines.push(...group)
    }
    setLines(newLines)
  }, [nodes, containerRef])

  // Measure on mount and when nodes change
  useLayoutEffect(measure, [measure])

  // Re-measure when container layout shifts (handles late paint / resize)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, containerRef])

  const colorDone = pv('status-done')
  const colorWip = pv('status-wip')
  const colorPending = pva('text-primary', 0.35)

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
      aria-hidden="true"
    >
      {lines.map((l, i) => {
        const c = l.status === 'done' ? colorDone
          : l.status === 'wip' ? colorWip
            : colorPending
        const isDone = l.status === 'done'
        const isWip = l.status === 'wip'

        return (
          <path
            key={i}
            d={orthogonalPath(l.x1, l.y1, l.x2, l.y2, 8, l.viaX)}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={isDone ? 'none' : isWip ? '8 4' : '6 6'}
            style={isWip ? {
              stroke: c,
              animation: 'dashFlow 1s linear infinite',
            } : { stroke: c }}
          />
        )
      })}
      <style>{`
        @keyframes dashFlow { to { stroke-dashoffset: -24; } }
        @media (prefers-reduced-motion: reduce) {
          svg path { animation: none !important; }
        }
      `}</style>
    </svg>
  )
}

/* ═══ Phase tree: left-to-right DAG ═══ */

interface PhaseMarkerInfo {
  id: string; name: string; status: TaskStatus
  progress: { done: number; total: number; pct: number }
}

function PhaseTree({
  phase, allTasks, sessions, autopilotSessions, onTaskClick, prevPhase, nextPhase, onNavigatePhase, projectPath, planName,
}: {
  phase: Phase; allTasks: Map<string, Task>; sessions: Session[]; autopilotSessions: AutopilotSession[]
  onTaskClick: (task: Task) => void
  prevPhase?: PhaseMarkerInfo | null; nextPhase?: PhaseMarkerInfo | null
  onNavigatePhase?: (phaseId: string) => void
  projectPath?: string
  planName?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [gateAnchor, setGateAnchor] = useState<HTMLElement | null>(null)
  const { nodes, maxCol, maxRow } = useMemo(() => buildTreeLayout(phase.tasks), [phase.tasks])

  // Layout with entry/exit markers and gate column
  const MARKER_W = 140
  const ENTRY_W = MARKER_W + GAP_X
  const EXIT_W = GAP_X + MARKER_W
  const hasGate = !!phase.gate
  const lastCol = hasGate ? maxCol + 1 : maxCol
  const treeW = (lastCol + 1) * (NODE_W + GAP_X) - GAP_X
  const treeH = (maxRow + 1) * (NODE_H + GAP_Y) - GAP_Y
  const totalW = ENTRY_W + treeW + EXIT_W
  const totalH = treeH
  const midY = treeH / 2
  const lineColor = pva('text-secondary', 0.25)

  // Gate node positioning
  const gateX = hasGate ? ENTRY_W + (maxCol + 1) * (NODE_W + GAP_X) : 0
  const gateY = midY - NODE_H / 2
  const gateCenterY = midY

  // Exit convergence: all exit lines turn vertical at the same X (just before gate/exit)
  const exitTargetX = hasGate ? gateX : (ENTRY_W + treeW + GAP_X)
  const exitConvergenceX = exitTargetX - GAP_X / 2

  // Entry line color: green when previous phase is done
  const entryColor = prevPhase?.status === 'done' ? pv('status-done')
    : prevPhase?.status === 'wip' ? pv('status-wip')
      : lineColor
  const entryDash = prevPhase?.status === 'done' ? 'none'
    : prevPhase?.status === 'wip' ? '8 4' : '6 6'

  // Find root and leaf nodes for entry/exit connector lines
  const childSet = useMemo(() => {
    const s = new Set<string>()
    for (const [, node] of nodes) for (const cid of node.children) s.add(cid)
    return s
  }, [nodes])
  const rootIds = useMemo(() => Array.from(nodes.keys()).filter((id) => !childSet.has(id)), [nodes, childSet])
  const leafIds = useMemo(() => Array.from(nodes.entries()).filter(([, n]) => n.children.length === 0).map(([id]) => id), [nodes])
  // Isolated tasks: both root AND leaf (no deps, nothing depends on them)
  const isolatedIds = useMemo(() => new Set(rootIds.filter((id) => leafIds.includes(id))), [rootIds, leafIds])

  // Status color helper
  const statusColor = (status: TaskStatus) => {
    if (status === 'done') return pv('status-done')
    if (status === 'wip') return pv('status-wip')
    return pva('text-primary', 0.35)
  }

  return (
    <Box
      ref={containerRef}
      data-testid="phase-tree"
      sx={{ position: 'relative', width: totalW, height: totalH, mx: 'auto', my: 1.5 }}
    >
      {/* Start marker */}
      <Box
        data-testid="start-marker"
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: MARKER_W,
          height: treeH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        {prevPhase ? (
          <Box
            onClick={() => onNavigatePhase?.(prevPhase.id)}
            sx={{
              width: MARKER_W,
              px: 1, py: 0.75, borderRadius: 1, border: '1px solid',
              borderColor: pv('outlineVariant'), bgcolor: pv('surface1'),
              cursor: 'pointer',
              transition: 'all var(--motion-short4, 200ms) var(--motion-emphasized, cubic-bezier(0.2, 0, 0, 1))',
              '&:hover': { borderColor: pva(`status-${prevPhase.status}`, 0.5), bgcolor: pva(`status-${prevPhase.status}`, 0.04) },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <StatusDot status={prevPhase.status} size={6} />
              <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: '0.6rem', fontWeight: 600, lineHeight: 1.2 }}>
                {prevPhase.name}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={prevPhase.progress.pct}
                sx={{
                  flex: 1, height: 3, borderRadius: 1.5,
                  bgcolor: pva(`status-${prevPhase.status}`, 0.12),
                  '& .MuiLinearProgress-bar': { bgcolor: pv(`status-${prevPhase.status}`), borderRadius: 1.5 },
                }}
              />
              <Typography variant="caption" sx={{ fontSize: '0.5rem', fontWeight: 600, color: pv(`status-${prevPhase.status}`), flexShrink: 0 }}>
                {prevPhase.progress.done}/{prevPhase.progress.total}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 600 }}>
            Start
          </Typography>
        )}
      </Box>

      {/* Entry/exit connector lines + gate connector lines */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }} aria-hidden="true">
        {/* Entry: start marker → root nodes (non-isolated) */}
        {rootIds.filter((id) => !isolatedIds.has(id)).map((rootId) => {
          const rootNode = nodes.get(rootId)
          if (!rootNode) return null
          const nx = ENTRY_W + rootNode.col * (NODE_W + GAP_X)
          const ny = rootNode.row * (NODE_H + GAP_Y) + NODE_H / 2
          return <path key={`entry-${rootId}`} d={orthogonalPath(MARKER_W, midY, nx, ny)} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={entryDash} style={{ stroke: entryColor }} />
        })}

        {/* Isolated tasks: direct line from entry → task → gate/exit */}
        {Array.from(isolatedIds).map((isoId) => {
          const isoNode = nodes.get(isoId)
          if (!isoNode) return null
          const ny = isoNode.row * (NODE_H + GAP_Y) + NODE_H / 2
          const taskLeft = ENTRY_W + isoNode.col * (NODE_W + GAP_X)
          const taskRight = taskLeft + NODE_W
          const exitX = hasGate ? gateX : (ENTRY_W + treeW + GAP_X)
          const c = statusColor(isoNode.task.status)
          const isDone = isoNode.task.status === 'done'
          const isWip = isoNode.task.status === 'wip'
          const dash = isDone ? 'none' : isWip ? '8 4' : '6 6'
          return (
            <g key={`iso-${isoId}`}>
              <path d={orthogonalPath(MARKER_W, midY, taskLeft, ny)} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={entryDash} style={{ stroke: entryColor }} />
              <path d={orthogonalPath(taskRight, ny, exitX, hasGate ? gateCenterY : midY, 8, exitX - GAP_X / 2)} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={dash} style={{ stroke: c }} />
            </g>
          )
        })}

        {/* Exit lines: leaf nodes → gate (or exit), non-isolated only */}
        {hasGate ? (
          <>
            {leafIds.filter((id) => !isolatedIds.has(id)).map((leafId) => {
              const leafNode = nodes.get(leafId)
              if (!leafNode) return null
              const nx = ENTRY_W + leafNode.col * (NODE_W + GAP_X) + NODE_W
              const ny = leafNode.row * (NODE_H + GAP_Y) + NODE_H / 2
              const c = statusColor(leafNode.task.status)
              const isDone = leafNode.task.status === 'done'
              const isWip = leafNode.task.status === 'wip'
              return <path key={`gate-${leafId}`} d={orthogonalPath(nx, ny, gateX, gateCenterY, 8, exitConvergenceX)} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={isDone ? 'none' : isWip ? '8 4' : '6 6'} style={{ stroke: c }} />
            })}
            {/* Gate → exit marker */}
            <path d={orthogonalPath(gateX + NODE_W, gateCenterY, ENTRY_W + treeW + GAP_X, midY)} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={phase.gate!.passed ? 'none' : '6 6'} style={{ stroke: phase.gate!.passed ? pv('status-done') : lineColor }} />
          </>
        ) : (
          leafIds.filter((id) => !isolatedIds.has(id)).map((leafId) => {
            const leafNode = nodes.get(leafId)
            if (!leafNode) return null
            const nx = ENTRY_W + leafNode.col * (NODE_W + GAP_X) + NODE_W
            const ny = leafNode.row * (NODE_H + GAP_Y) + NODE_H / 2
            const c = statusColor(leafNode.task.status)
            const isDone = leafNode.task.status === 'done'
            const isWip = leafNode.task.status === 'wip'
            return <path key={`exit-${leafId}`} d={orthogonalPath(nx, ny, ENTRY_W + treeW + GAP_X, midY, 8)} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={isDone ? 'none' : isWip ? '8 4' : '6 6'} style={{ stroke: c }} />
          })
        )}
      </svg>

      {/* SVG connector lines (between task nodes) */}
      <TreeConnectors nodes={nodes} containerRef={containerRef} />

      {/* Task nodes */}
      {Array.from(nodes.values()).map((node) => {
        const session = findSessionForTask(node.task.id, sessions, node.task.status)
        const autopilot = autopilotSessions.find((a) => a.task === node.task.id)

        return (
          <Box
            key={node.task.id}
            sx={{
              position: 'absolute',
              left: ENTRY_W + node.col * (NODE_W + GAP_X),
              top: node.row * (NODE_H + GAP_Y),
            }}
          >
            <TaskNodeCard
              node={node}
              blocked={isBlocked(node.task, allTasks)}
              session={session}
              autopilotSession={autopilot}
              onClick={() => onTaskClick(node.task)}
            />
          </Box>
        )
      })}

      {/* Gate node (inline, after last task column) */}
      {hasGate && phase.gate && (
        <>
          <Box
            data-testid="gate-node"
            data-node-id="__gate"
            onClick={(e) => setGateAnchor(e.currentTarget)}
            sx={{
              position: 'absolute',
              left: gateX,
              top: gateY,
              width: NODE_W,
              height: NODE_H,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              borderRadius: 1,
              border: phase.gate.passed ? '1px solid' : '1px dashed',
              borderColor: phase.gate.passed ? pva('status-done', 0.35) : pv('outlineVariant'),
              bgcolor: phase.gate.passed ? pva('status-done', 0.04) : pv('surface1'),
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
              '&:hover': { borderColor: phase.gate.passed ? pv('status-done') : pv('primary-main') },
            }}
          >
            {phase.gate.passed
              ? <LockOpenIcon sx={{ fontSize: 16, color: pv('status-done'), flexShrink: 0 }} />
              : <LockIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" noWrap sx={{ fontSize: '0.6rem', fontWeight: 600, color: phase.gate.passed ? pv('status-done') : 'text.primary', display: 'block', lineHeight: 1.3 }}>
                {phase.gate.name}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.5rem', color: 'text.secondary', lineHeight: 1.2 }}>
                {phase.gate.passed ? phase.gate.checklist.length : 0}/{phase.gate.checklist.length} checks
              </Typography>
            </Box>
          </Box>
          <Popover
            open={!!gateAnchor}
            anchorEl={gateAnchor}
            onClose={() => setGateAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { maxWidth: 420, p: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' } } }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="labelMedium" sx={{ fontWeight: 600, flex: 1 }}>
                {phase.gate.name}
              </Typography>
              {phase.gate.passed && (
                <Chip label="PASSED" size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, bgcolor: pva('status-done', 0.12), color: pv('status-done') }} />
              )}
            </Box>
            {phase.gate.checklist.map((item, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                {phase.gate!.passed
                  ? <CheckCircleIcon sx={{ fontSize: 16, color: pv('status-done'), mt: 0.25, flexShrink: 0 }} />
                  : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.25, flexShrink: 0 }} />}
                <Typography variant="body2" sx={{ fontSize: '0.82rem', userSelect: 'text', cursor: 'text' }}>{item}</Typography>
              </Box>
            ))}
            {(() => {
              const checklist = phase.gate!.checklist.map((item, i) => `${i + 1}. ${item}`).join('\n')
              const cmdLine = phase.gate!.command ? `\nVerification command: ${phase.gate!.command}` : ''
              const prompt = [
                `We are closing phase "${phase.name}" from execution plan "${planName ?? 'unknown'}".`,
                `Verify the "${phase.gate!.name}" gate checks:`,
                '',
                checklist,
                cmdLine,
                '',
                `Run the verification${phase.gate!.command ? ' command' : ''}, confirm all checks pass, then update the execution plan YAML to set this gate's passed: true.`,
              ].filter((l) => l !== '').join('\n')
              return (
                <Paper
                  sx={{
                    mt: 1.5,
                    p: 1,
                    display: 'flex',
                    alignItems: 'flex-start',
                    bgcolor: 'surfaceVariant',
                    border: 'none',
                  }}
                >
                  <Typography
                    component="pre"
                    sx={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      flex: 1,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      m: 0,
                      userSelect: 'text',
                      cursor: 'text',
                      lineHeight: 1.6,
                    }}
                  >
                    {prompt}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => navigator.clipboard.writeText(prompt)}
                    aria-label="Copy gate prompt"
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Paper>
              )
            })()}
          </Popover>
        </>
      )}

      {/* End marker */}
      <Box
        data-testid="end-marker"
        sx={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: MARKER_W,
          height: treeH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        {nextPhase ? (
          <Box
            onClick={() => onNavigatePhase?.(nextPhase.id)}
            sx={{
              width: MARKER_W,
              px: 1, py: 0.75, borderRadius: 1, border: '1px solid',
              borderColor: pv('outlineVariant'), bgcolor: pv('surface1'),
              cursor: 'pointer',
              transition: 'all var(--motion-short4, 200ms) var(--motion-emphasized, cubic-bezier(0.2, 0, 0, 1))',
              '&:hover': { borderColor: pva(`status-${nextPhase.status}`, 0.5), bgcolor: pva(`status-${nextPhase.status}`, 0.04) },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <StatusDot status={nextPhase.status} size={6} />
              <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: '0.6rem', fontWeight: 600, lineHeight: 1.2 }}>
                {nextPhase.name}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={nextPhase.progress.pct}
                sx={{
                  flex: 1, height: 3, borderRadius: 1.5,
                  bgcolor: pva(`status-${nextPhase.status}`, 0.12),
                  '& .MuiLinearProgress-bar': { bgcolor: pv(`status-${nextPhase.status}`), borderRadius: 1.5 },
                }}
              />
              <Typography variant="caption" sx={{ fontSize: '0.5rem', fontWeight: 600, color: pv(`status-${nextPhase.status}`), flexShrink: 0 }}>
                {nextPhase.progress.done}/{nextPhase.progress.total}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 600 }}>
            Finished
          </Typography>
        )}
      </Box>
    </Box>
  )
}

/* ═══ Compact Phase Card (horizontal rail) ═══ */

function CompactPhaseCard({
  phase, isActive, onClick, cardRef,
}: {
  phase: Phase; isActive: boolean; onClick: () => void; cardRef?: React.RefObject<HTMLDivElement | null>
}) {
  const status = phaseStatus(phase)
  const progress = phaseProgress(phase)
  const statusPath = `status-${status}`
  const color = pv(statusPath)

  return (
    <Box
      ref={cardRef}
      data-testid="phase-card"
      onClick={onClick}
      role="button"
      aria-expanded={isActive}
      aria-label={`${phase.name}, ${progress.pct}% complete, ${progress.done} of ${progress.total} tasks done`}
      sx={{
        scrollSnapAlign: 'center',
        flexShrink: 0,
        minWidth: 140,
        maxWidth: 200,
        px: 1.5,
        py: 1,
        borderRadius: 1,
        border: '1px solid',
        borderColor: isActive ? pva(statusPath, 0.5) : pv('outlineVariant'),
        bgcolor: isActive ? pva(statusPath, 0.06) : pv('surface1'),
        cursor: 'pointer',
        userSelect: 'none',
        transition: `all var(--motion-short4, 200ms) var(--motion-emphasized, cubic-bezier(0.2, 0, 0, 1))`,
        '&:hover': {
          borderColor: pva(statusPath, 0.5),
          bgcolor: pva(statusPath, 0.04),
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <StatusDot status={status} size={6} />
        <Typography variant="labelMedium" noWrap sx={{ flex: 1, lineHeight: 1.2 }}>
          {phase.name}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={progress.pct}
            sx={{
              height: 4,
              borderRadius: 2,
              bgcolor: pva(statusPath, 0.12),
              '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 2 },
            }}
          />
        </Box>
        <Typography variant="labelSmall" sx={{ color, fontWeight: 600, flexShrink: 0 }}>
          {progress.done}/{progress.total}
        </Typography>
      </Box>
    </Box>
  )
}

/* ═══ Phase card connector (SVG line between cards) ═══ */

function PhaseCardConnector({ prevStatus }: { prevStatus: TaskStatus }) {
  const color = prevStatus === 'done'
    ? pv('status-done')
    : pva('text-secondary', 0.3)

  return (
    <Box
      data-testid="phase-connector"
      sx={{
        flexShrink: 0,
        width: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box sx={{ width: '100%', height: 2, bgcolor: color, borderRadius: 1 }} />
    </Box>
  )
}

/* ═══ localStorage helpers ═══ */

function getStorageKey(planName: string): string {
  return `pipeline-expanded-${planName}`
}

function loadExpandedPhase(planName: string, phases: Phase[]): string | null {
  try {
    const raw = localStorage.getItem(getStorageKey(planName))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') {
      // Validate: phase ID must exist
      if (phases.some((p) => p.id === parsed)) return parsed
    }
    return null
  } catch {
    return null
  }
}

function saveExpandedPhase(planName: string, phaseId: string | null): void {
  try {
    localStorage.setItem(getStorageKey(planName), JSON.stringify(phaseId))
  } catch {
    // Silently ignore storage errors
  }
}

/* ═══ Main Pipeline ═══ */

interface Props {
  plan: Plan
  sessions?: Session[]
  projectPath?: string
}

export default function Pipeline({ plan, sessions = [], projectPath }: Props) {
  const { data: autopilotSessions } = useAutopilots()

  const allTasks = useMemo(() => {
    const m = new Map<string, Task>()
    for (const phase of plan.phases) for (const task of phase.tasks) m.set(task.id, task)
    return m
  }, [plan])

  const allTasksArray = useMemo(() => flattenTasks(plan), [plan])

  // Filter state
  const [filter, setFilter] = useState<TaskStatusFilter>('all')

  // Compute filter counts
  const filterCounts = useMemo(() => {
    let wip = 0, blocked = 0, failed = 0
    for (const task of allTasksArray) {
      if (task.status === 'wip') wip++
      if (task.status === 'failed') failed++
      if (task.status === 'pending' && isBlocked(task, allTasks)) blocked++
    }
    return { wip, blocked, failed }
  }, [allTasksArray, allTasks])

  // Single expansion: expandedPhaseId: string | null
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(() => {
    const stored = loadExpandedPhase(plan.name, plan.phases)
    if (stored) return stored
    // Auto-expand first WIP/failed phase
    for (const phase of plan.phases) {
      const s = phaseStatus(phase)
      if (s === 'wip' || s === 'failed') return phase.id
    }
    return null
  })

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task)
  }, [])

  // Match selected task to autopilot session
  const selectedAutopilot = selectedTask
    ? autopilotSessions?.find((a) => a.task === selectedTask.id) ?? null
    : null

  // Find previous phase gate for the selected task
  const selectedPreviousGate = useMemo(() => {
    if (!selectedTask) return null
    for (let i = 0; i < plan.phases.length; i++) {
      const phase = plan.phases[i]
      if (phase.tasks.some((t) => t.id === selectedTask.id) && i > 0) {
        const prevGate = plan.phases[i - 1].gate
        return prevGate ? { name: prevGate.name, passed: prevGate.passed } : null
      }
    }
    return null
  }, [selectedTask, plan.phases])

  const togglePhase = useCallback((id: string) => {
    setExpandedPhaseId((prev) => {
      const next = prev === id ? null : id
      saveExpandedPhase(plan.name, next)
      return next
    })
  }, [plan.name])

  const expandedPhase = plan.phases.find((p) => p.id === expandedPhaseId) ?? null
  const expandedPhaseIdx = expandedPhase ? plan.phases.indexOf(expandedPhase) : -1
  const prevPhase = useMemo(() => {
    if (expandedPhaseIdx <= 0) return null
    const p = plan.phases[expandedPhaseIdx - 1]
    return { id: p.id, name: p.name, status: phaseStatus(p), progress: phaseProgress(p) }
  }, [expandedPhaseIdx, plan.phases])
  const nextPhase = useMemo(() => {
    if (expandedPhaseIdx < 0 || expandedPhaseIdx >= plan.phases.length - 1) return null
    const p = plan.phases[expandedPhaseIdx + 1]
    return { id: p.id, name: p.name, status: phaseStatus(p), progress: phaseProgress(p) }
  }, [expandedPhaseIdx, plan.phases])

  // Ref for auto-scroll to active phase card
  const activeCardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [])

  return (
    <Box>
      {/* Filter chips */}
      <Box sx={{ mb: 1.5 }}>
        <StatusFilterChips
          filter={filter}
          onChange={setFilter}
          counts={filterCounts}
          totalTasks={allTasksArray.length}
        />
      </Box>

      {/* Horizontal card rail */}
      <Box
        sx={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          gap: 0,
          pb: 1,
          mb: 1,
          '&::-webkit-scrollbar': { height: 4 },
          '&::-webkit-scrollbar-thumb': { borderRadius: 2, bgcolor: 'divider' },
        }}
      >
        {plan.phases.map((phase, i) => (
          <Fragment key={phase.id}>
            {i > 0 && <PhaseCardConnector prevStatus={phaseStatus(plan.phases[i - 1])} />}
            <CompactPhaseCard
              phase={phase}
              isActive={expandedPhaseId === phase.id}
              onClick={() => togglePhase(phase.id)}
              cardRef={expandedPhaseId === phase.id ? activeCardRef : undefined}
            />
          </Fragment>
        ))}
      </Box>

      {/* Single expansion panel */}
      <Collapse in={expandedPhaseId !== null} timeout={{ enter: 300, exit: 200 }} unmountOnExit>
        {expandedPhase && (
          <Box
            sx={{
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              overflow: 'hidden',
              mb: 1,
            }}
          >
            <Box sx={{ px: 1, py: 1 }}>
              {expandedPhase.tasks.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 1, fontStyle: 'italic', display: 'block' }}>No tasks defined yet</Typography>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <PhaseTree phase={expandedPhase} allTasks={allTasks} sessions={sessions} autopilotSessions={autopilotSessions ?? []} onTaskClick={handleTaskClick} prevPhase={prevPhase} nextPhase={nextPhase} onNavigatePhase={(phaseId) => togglePhase(phaseId)} projectPath={projectPath} planName={plan.name} />
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Collapse>

      {/* Unified session panel dialog */}
      <Dialog
        open={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
        maxWidth={false}
        PaperProps={{
          sx: {
            width: '90vw',
            maxWidth: 1200,
            height: '94vh',
            maxHeight: 1100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
      >
        {selectedTask && (
          <SessionPanel
            task={selectedTask}
            autopilotSession={selectedAutopilot}
            projectPath={projectPath}
            allTasks={allTasks}
            previousGate={selectedPreviousGate}
            onClose={() => setSelectedTask(null)}
            onSelectTask={(id) => {
              const t = allTasks.get(id)
              if (t) setSelectedTask(t)
            }}
          />
        )}
      </Dialog>
    </Box>
  )
}
