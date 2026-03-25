import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled'
import TerminalIcon from '@mui/icons-material/Terminal'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { useAutopilotStream } from '../../hooks/useAutopilotStream'
import type { StreamEvent, StreamContentBlock } from '../../hooks/useAutopilotStream'
import { useSessionActivity } from '../../hooks/useSessionActivity'
import type { ToolActivity } from '../../hooks/useSessionActivity'
import { pv, pva } from '../../utils/cssVars'

const SCROLL_THRESHOLD = 50
const TOOL_RESULT_PREVIEW_LINES = 4

type EventFilter = 'text' | 'tool' | 'result' | 'phase' | 'orchestrator'

// ─── Markdown link interception ──────────────────────────────────────

const markdownComponents: Components = {
  a: ({ href, children, ...props }) => (
    <a
      {...props}
      href={href}
      onClick={(e) => { e.preventDefault() }}
      style={{ color: 'var(--mui-palette-primary-main)', textDecoration: 'none', borderBottom: '1px dotted currentColor' }}
    >
      {children}
    </a>
  ),
}

// ─── Markdown styles ─────────────────────────────────────────────────

const markdownSx = {
  '& h1': { typography: 'titleLarge', mt: 2, mb: 1 },
  '& h2': { typography: 'titleMedium', mt: 1.5, mb: 0.75 },
  '& h3': { typography: 'labelLarge', mt: 1, mb: 0.5 },
  '& p': { typography: 'body2', mb: 1, lineHeight: 1.75, color: 'text.primary' },
  '& ul, & ol': { pl: 3, mb: 1 },
  '& li': { typography: 'body2', mb: 0.25, lineHeight: 1.75 },
  '& code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.82em',
    bgcolor: pva('primary-main', 0.07),
    color: pv('primary-main'),
    px: 0.75,
    py: 0.25,
    borderRadius: 1,
    fontWeight: 500,
  },
  '& pre': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    bgcolor: 'background.default',
    border: '1px solid',
    borderColor: 'divider',
    p: 2,
    borderRadius: 2,
    overflowX: 'auto',
    mb: 1.5,
    lineHeight: 1.7,
  },
  '& pre code': { bgcolor: 'transparent', color: 'text.primary', p: 0, fontWeight: 400 },
  '& table': {
    width: '100%',
    borderCollapse: 'collapse',
    mb: 1.5,
    fontSize: '0.85rem',
  },
  '& th, & td': {
    border: '1px solid',
    borderColor: 'divider',
    px: 1.5,
    py: 0.75,
    typography: 'body2',
  },
  '& th': { bgcolor: pva('primary-main', 0.04), fontWeight: 500 },
  '& blockquote': {
    borderLeft: '3px solid',
    borderColor: pv('primary-main'),
    pl: 2,
    ml: 0,
    my: 1,
    color: 'text.secondary',
  },
  '& strong': { fontWeight: 600 },
  '& em': { color: 'text.secondary' },
  '& hr': { border: 'none', borderTop: '1px solid', borderColor: 'divider', my: 2 },
  '& input[type="checkbox"]': { mr: 1 },
} as const

// ─── Sub-components ─────────────────────────────────────────────────

function PhaseMarker({ event }: { event: StreamEvent }) {
  const isCompleted = event.status === 'completed'
  const isFailed = event.status === 'failed'
  const durationLabel = event.duration_s != null
    ? event.duration_s >= 60
      ? `${Math.floor(event.duration_s / 60)}m ${event.duration_s % 60}s`
      : `${event.duration_s}s`
    : null

  const statusColor = isCompleted ? 'status-done' : isFailed ? 'status-failed' : 'primary-main'

  return (
    <Box sx={{ px: 3, py: 2.5, my: 0.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          pb: 1.5,
          borderBottom: '2px solid',
          borderColor: pva(statusColor, 0.3),
        }}
      >
        {isCompleted ? (
          <CheckCircleIcon sx={{ color: pv('status-done'), fontSize: 22 }} />
        ) : isFailed ? (
          <ErrorIcon sx={{ color: pv('status-failed'), fontSize: 22 }} />
        ) : (
          <PlayCircleFilledIcon sx={{ color: pv('primary-main'), fontSize: 22 }} />
        )}
        <Typography variant="titleMedium" sx={{ fontWeight: 600, flex: 1, letterSpacing: '-0.01em' }}>
          {event.phase}
        </Typography>
        {durationLabel && (
          <Typography variant="labelSmall" color="text.secondary" sx={{ fontFamily: 'var(--font-mono)' }}>
            {durationLabel}
          </Typography>
        )}
        <Chip
          label={event.status ?? 'running'}
          size="small"
          sx={{
            height: 22,
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            bgcolor: pva(statusColor, 0.1),
            color: pv(statusColor),
          }}
        />
      </Box>
    </Box>
  )
}


function OrchestratorMessage({ event }: { event: StreamEvent }) {
  if (!event.msg) return null
  return (
    <Box
      sx={{
        mx: 3,
        my: 0.5,
        px: 2,
        py: 0.75,
        borderLeft: '3px solid',
        borderColor: pva('primary-main', 0.3),
        bgcolor: pva('primary-main', 0.04),
        borderRadius: '0 6px 6px 0',
      }}
    >
      <Typography
        variant="body2"
        sx={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem',
          color: 'text.secondary',
          whiteSpace: 'pre-wrap',
        }}
      >
        {event.msg}
      </Typography>
    </Box>
  )
}

function TextBlock({ text }: { text: string }) {
  return (
    <Box
      sx={{
        mx: 3,
        my: 1.5,
        py: 1,
        ...markdownSx,
        '& p:last-child': { mb: 0 },
      }}
    >
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</Markdown>
    </Box>
  )
}

function ToolCallBlock({ block }: { block: StreamContentBlock }) {
  const toolName = block.name ?? 'tool'
  const description = block.input?.command
    ? String(block.input.command).slice(0, 140)
    : block.input?.file_path
      ? String(block.input.file_path)
      : block.input?.pattern
        ? String(block.input.pattern)
        : block.input?.prompt
          ? String(block.input.prompt).slice(0, 100)
          : undefined

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        mx: 3,
        my: 0.75,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '10px !important',
        '&::before': { display: 'none' },
        overflow: 'hidden',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          borderColor: pva('primary-main', 0.3),
          boxShadow: `0 0 0 1px ${pva('primary-main', 0.08)}`,
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: 'text.disabled' }} />}
        sx={{
          minHeight: 42,
          '& .MuiAccordionSummary-content': { my: 0.5, gap: 1, alignItems: 'center', minWidth: 0 },
        }}
      >
        <TerminalIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
        <Chip
          label={toolName}
          size="small"
          sx={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            fontWeight: 600,
            height: 22,
            bgcolor: pva('primary-main', 0.08),
            color: pv('primary-main'),
            flexShrink: 0,
          }}
        />
        {description && (
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'var(--font-mono)',
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              fontSize: '0.72rem',
            }}
          >
            {description}
          </Typography>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
        <Box
          component="pre"
          sx={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            bgcolor: 'background.default',
            border: '1px solid',
            borderColor: 'divider',
            p: 1.5,
            borderRadius: 1.5,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            m: 0,
            lineHeight: 1.6,
          }}
        >
          {JSON.stringify(block.input, null, 2)}
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}

function ToolResultBlock({ block }: { block: StreamContentBlock }) {
  const [expanded, setExpanded] = useState(false)
  const rawContent = block.content
  const content = typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((c: unknown) => (typeof c === 'object' && c !== null && 'text' in c ? (c as { text: string }).text : String(c))).join('\n')
      : rawContent != null ? String(rawContent) : ''
  const lines = content.split('\n')
  const needsTruncation = lines.length > TOOL_RESULT_PREVIEW_LINES
  const displayContent = expanded || !needsTruncation
    ? content
    : lines.slice(0, TOOL_RESULT_PREVIEW_LINES).join('\n')

  return (
    <Accordion
      disableGutters
      elevation={0}
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      sx={{
        mx: 3,
        my: 0.25,
        border: '1px solid',
        borderColor: pva('text-primary', 0.06),
        borderRadius: '10px !important',
        '&::before': { display: 'none' },
        overflow: 'hidden',
        opacity: 0.6,
        transition: 'opacity 0.15s ease',
        '&:hover': { opacity: 0.9 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
        sx={{ minHeight: 28, '& .MuiAccordionSummary-content': { my: 0.25 } }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
          output · {lines.length} lines{needsTruncation && !expanded ? ' (truncated)' : ''}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Box
          component="pre"
          sx={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            bgcolor: 'background.default',
            p: 1.5,
            borderRadius: 1.5,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            m: 0,
            maxHeight: expanded ? 400 : undefined,
            overflowY: expanded ? 'auto' : undefined,
            lineHeight: 1.6,
            color: 'text.secondary',
          }}
        >
          {displayContent}
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}

function ResultSummary({ event }: { event: StreamEvent }) {
  const isSuccess = event.subtype === 'success'
  const durationMin = event.duration_ms != null ? (event.duration_ms / 60000).toFixed(1) : null

  return (
    <Box
      sx={{
        mx: 3,
        my: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Box sx={{ flex: 1, borderTop: '1px solid', borderColor: 'divider' }} />
      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
        {event.num_turns != null && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
            {event.num_turns} turns
          </Typography>
        )}
        {durationMin != null && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
            · {durationMin}m
          </Typography>
        )}
        {event.total_cost_usd != null && (
          <Typography variant="caption" sx={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 500, color: isSuccess ? pv('status-done') : pv('status-failed') }}>
            · ${event.total_cost_usd.toFixed(2)}
          </Typography>
        )}
      </Stack>
      <Box sx={{ flex: 1, borderTop: '1px solid', borderColor: 'divider' }} />
    </Box>
  )
}

// ─── Event filter helpers ────────────────────────────────────────────

function getEventFilter(event: StreamEvent): EventFilter | null {
  if (event.type === 'phase') return 'phase'
  if (event.type === 'orchestrator') return 'orchestrator'
  if (event.type === 'result') return 'result'
  if (event.type === 'assistant' && event.message?.content) {
    const hasText = event.message.content.some((b) => b.type === 'text')
    const hasTool = event.message.content.some((b) => b.type === 'tool_use')
    if (hasTool) return 'tool'
    if (hasText) return 'text'
  }
  if (event.type === 'user') return 'tool'
  return null
}

const FILTER_ORDER: EventFilter[] = ['phase', 'orchestrator', 'text', 'result', 'tool']
const FILTER_LABELS: Record<EventFilter, string> = {
  phase: 'Phases',
  text: 'Narrative',
  tool: 'Tool calls',
  result: 'Results',
  orchestrator: 'Pipeline',
}

// ─── Event renderer ─────────────────────────────────────────────────

function StreamEventRenderer({ event, index }: { event: StreamEvent; index: number }) {
  if (event.type === 'phase') return <PhaseMarker event={event} />
  if (event.type === 'result') return <ResultSummary event={event} />
  if (event.type === 'orchestrator') return <OrchestratorMessage event={event} />

  if (event.type === 'assistant' && event.message?.content) {
    return (
      <>
        {event.message.content.map((block, bi) => {
          if (block.type === 'thinking') return null
          if (block.type === 'text' && block.text) return <TextBlock key={`${index}-${bi}`} text={block.text} />
          if (block.type === 'tool_use') return <ToolCallBlock key={`${index}-${bi}`} block={block} />
          return null
        })}
      </>
    )
  }

  if (event.type === 'user' && event.message?.content) {
    return (
      <>
        {event.message.content.map((block, bi) => {
          if (block.type === 'tool_result') return <ToolResultBlock key={`${index}-${bi}`} block={block} />
          return null
        })}
      </>
    )
  }

  return null
}

// ─── Activity feed (from sessions.jsonl when stream is stale) ────────

const reducedMotionQuery = '@media (prefers-reduced-motion: reduce)'

function ActivityStrip({ events, isActive }: { events: ToolActivity[]; isActive: boolean }) {
  if (events.length === 0) return null

  return (
    <Box
      sx={{
        flexShrink: 0,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: pva('primary-main', 0.02),
        maxHeight: 120,
        overflowY: 'auto',
        px: 2,
        py: 0.75,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        {isActive && (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: pv('status-done'),
              animation: 'activityPulse 2s ease-in-out infinite',
              '@keyframes activityPulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.3 },
              },
              [reducedMotionQuery]: { animation: 'none' },
            }}
          />
        )}
        <Typography variant="labelSmall" color="text.disabled" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Live activity
        </Typography>
      </Box>
      {events.slice(0, 8).map((evt, i) => {
        const age = evt.ts ? Math.floor((Date.now() - new Date(evt.ts).getTime()) / 1000) : null
        const ageLabel = age !== null
          ? age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`
          : ''
        return (
          <Box
            key={`${evt.ts}-${i}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              py: 0.125,
              opacity: i === 0 ? 0.9 : Math.max(0.25, 0.9 - i * 0.1),
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                fontWeight: 600,
                color: pv('primary-main'),
                flexShrink: 0,
                width: 32,
              }}
            >
              {evt.tool}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}
            >
              {evt.summary}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.58rem',
                color: 'text.disabled',
                flexShrink: 0,
              }}
            >
              {ageLabel}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

// ─── Main component ─────────────────────────────────────────────────

export default function StreamViewer({ task }: { task: string }) {
  const { events, isLive } = useAutopilotStream(task)
  const { events: activityEvents, isActive: activityIsActive } = useSessionActivity(task, !isLive)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [hiddenFilters, setHiddenFilters] = useState<Set<EventFilter>>(new Set(['tool']))

  const toggleFilter = useCallback((filter: EventFilter) => {
    setHiddenFilters((prev) => {
      const next = new Set(prev)
      if (next.has(filter)) next.delete(filter)
      else next.add(filter)
      return next
    })
  }, [])

  const filteredEvents = useMemo(() =>
    events.filter((event) => {
      const f = getEventFilter(event)
      return f === null || !hiddenFilters.has(f)
    }),
    [events, hiddenFilters]
  )

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setAutoScroll(el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD)
  }, [])

  const jumpToBottom = useCallback(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      setAutoScroll(true)
    }
  }, [])

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [filteredEvents, autoScroll])

  return (
    <Box sx={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Filter bar */}
      <Box sx={{
        px: 3, py: 1,
        borderBottom: '1px solid', borderColor: 'divider',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <Typography variant="labelSmall" color="text.disabled" sx={{ mr: 0.5 }}>
          Show
        </Typography>
        {FILTER_ORDER.map((f) => {
          const active = !hiddenFilters.has(f)
          return (
            <Chip
              key={f}
              label={FILTER_LABELS[f]}
              size="small"
              onClick={() => toggleFilter(f)}
              sx={{
                height: 26,
                fontSize: '0.75rem',
                fontWeight: active ? 500 : 400,
                cursor: 'pointer',
                bgcolor: active ? pva('primary-main', 0.08) : 'transparent',
                color: active ? 'text.primary' : 'text.disabled',
                border: '1px solid',
                borderColor: active ? pva('primary-main', 0.15) : pva('text-primary', 0.08),
                transition: 'all 0.15s ease',
                '&:hover': { bgcolor: pva('primary-main', 0.12), color: 'text.primary' },
              }}
            />
          )
        })}
      </Box>

      {/* Event stream */}
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        aria-label={`Live stream output for ${task}`}
        sx={{
          flex: 1,
          overflowY: 'auto',
          pt: 1,
          pb: 4,
          color: 'text.primary',
        }}
      >
        {filteredEvents.map((event, i) => (
          <StreamEventRenderer key={i} event={event} index={i} />
        ))}
      </Box>

      {/* Activity strip — always visible, polls when stream is stale */}
      <ActivityStrip events={activityEvents} isActive={activityIsActive} />

      {/* Jump to bottom */}
      {!autoScroll && (
        <IconButton
          size="medium"
          onClick={jumpToBottom}
          aria-label="Jump to bottom"
          sx={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            bgcolor: 'surface2',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            backdropFilter: 'blur(8px)',
            '&:hover': { bgcolor: 'surface3' },
          }}
        >
          <KeyboardArrowDownIcon />
        </IconButton>
      )}
    </Box>
  )
}
