import { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import HistoryIcon from '@mui/icons-material/History'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import { pv, pva } from '../utils/cssVars'
import { buildFocusUri, buildLaunchCommand } from '../utils/focusUri'
import { useAutopilotArtifacts } from '../hooks/useAutopilotArtifacts'
import { usePlanArtifacts } from '../hooks/usePlanArtifacts'
import { useAutopilotStream } from '../hooks/useAutopilotStream'
import PhaseStepper from './autopilot/PhaseStepper'
import type { Task, AutopilotSession } from '../types'

const reducedMotionQuery = '@media (prefers-reduced-motion: reduce)'

const StreamViewer = lazy(() => import('./autopilot/StreamViewer'))
const LogViewer = lazy(() => import('./autopilot/LogViewer'))
const ArtifactDialog = lazy(() => import('./autopilot/ArtifactDialog'))

interface SessionPanelProps {
  task: Task | null
  autopilotSession: AutopilotSession | null
  projectPath?: string | null
  allTasks?: Map<string, Task>
  onClose?: () => void
  onSelectTask?: (taskId: string) => void
  previousGate?: { name: string; passed: boolean } | null
}

export default function SessionPanel({
  task,
  autopilotSession,
  projectPath,
  allTasks,
  onClose,
  onSelectTask,
  previousGate,
}: SessionPanelProps) {
  const headerRef = useRef<HTMLSpanElement>(null)
  const [artifactFile, setArtifactFile] = useState<string | null>(null)
  const [artifactUrl, setArtifactUrl] = useState<string | null>(null)
  const [showStream, setShowStream] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const name = task?.name ?? autopilotSession?.task ?? null
  const taskId = task?.id ?? autopilotSession?.task ?? null
  const isRunning = autopilotSession?.status === 'running'
  const isCompleted = autopilotSession?.status === 'completed' || autopilotSession?.status === 'failed'
  const isNotStarted = task?.status === 'pending' || task?.status === 'wip'

  // Compute dependents (tasks that depend on this task)
  const dependents = useMemo(() => {
    if (!taskId || !allTasks) return []
    const result: string[] = []
    allTasks.forEach((t) => {
      if (t.depends?.includes(taskId)) result.push(t.id)
    })
    return result
  }, [taskId, allTasks])

  // Artifacts: merge plan + autopilot, deduplicate by filename
  const planArtifacts = usePlanArtifacts(projectPath ?? null, task?.id ?? null)
  const autopilotArtifacts = useAutopilotArtifacts(autopilotSession?.task ?? null)
  const { hasStream } = useAutopilotStream(autopilotSession?.task ?? null)

  // Sort artifacts by pipeline phase order, not alphabetically
  const ARTIFACT_ORDER: Record<string, number> = {
    'REQUIREMENTS.md': 1,
    'DESIGN.md': 2,
    'PLAN.md': 3,
    'REVIEW.md': 4,
    'TEAM_REVIEW.md': 4,
    'TESTPLAN.md': 5,
    'STATIC_ANALYSIS.md': 6,
    'MANUAL_TEST_LOG.md': 7,
    'TEAM_QA.md': 8,
    'QA_REPORT.md': 9,
  }

  const mergedArtifacts = (() => {
    const seen = new Set<string>()
    const result: { name: string; file: string; source: 'autopilot' | 'plan' }[] = []
    // Autopilot artifacts take precedence
    for (const a of autopilotArtifacts) {
      if (!seen.has(a.file)) {
        seen.add(a.file)
        result.push({ ...a, source: 'autopilot' })
      }
    }
    for (const a of planArtifacts) {
      if (!seen.has(a.file)) {
        seen.add(a.file)
        result.push({ ...a, source: 'plan' })
      }
    }
    result.sort((a, b) => (ARTIFACT_ORDER[a.file] ?? 99) - (ARTIFACT_ORDER[b.file] ?? 99))
    return result
  })()

  // Reset view when task selection changes (not on status flicker)
  const prevTaskIdRef = useRef(taskId)
  const hasInitStreamRef = useRef(false)
  useEffect(() => {
    if (taskId !== prevTaskIdRef.current) {
      prevTaskIdRef.current = taskId
      hasInitStreamRef.current = false
      setShowStream(!!autopilotSession && autopilotSession.status === 'running')
      if (autopilotSession?.status === 'running') hasInitStreamRef.current = true
      setArtifactFile(null)
      setArtifactUrl(null)
    } else if (!hasInitStreamRef.current && autopilotSession?.status === 'running') {
      // Autopilot session arrived after initial render — switch to stream
      hasInitStreamRef.current = true
      setShowStream(true)
    }
  }, [taskId, autopilotSession])

  // Focus header on selection change
  useEffect(() => {
    if (name && headerRef.current) headerRef.current.focus()
  }, [taskId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) onClose()
  }, [onClose])

  const handleCopyPrompt = () => {
    if (task?.prompt) navigator.clipboard.writeText(task.prompt)
  }

  const handleLaunch = () => {
    if (!projectPath || !task) return
    const cmd = buildLaunchCommand(projectPath, task.id, task.pipeline)
    if (!cmd) return
    navigator.clipboard.writeText(cmd)
    const uri = buildFocusUri(projectPath)
    if (uri) {
      const prev = document.querySelector('iframe[data-vscode-focus]')
      if (prev) prev.remove()
      const iframe = document.createElement('iframe')
      iframe.setAttribute('data-vscode-focus', '')
      iframe.style.display = 'none'
      iframe.src = uri
      document.body.appendChild(iframe)
      setTimeout(() => iframe.remove(), 3000)
    }
    setSnackbar('Autopilot command copied — paste into VS Code terminal')
  }

  const handleArtifactClick = (file: string, source: 'autopilot' | 'plan') => {
    if (source === 'autopilot' && autopilotSession) {
      setArtifactUrl(`/api/autopilot/artifact?task=${encodeURIComponent(autopilotSession.task)}&file=${encodeURIComponent(file)}`)
    } else if (projectPath && task) {
      setArtifactUrl(`/api/plan/artifact?cwd=${encodeURIComponent(projectPath)}&task=${encodeURIComponent(task.id)}&file=${encodeURIComponent(file)}`)
    }
    setArtifactFile(file)
  }

  // Launch button visibility
  const depsReady = !task?.depends?.length || task.depends.every((dep) => {
    const depTask = allTasks?.get(dep)
    return depTask?.status === 'done' || depTask?.status === 'skipped'
  })
  const showLaunch = task?.autopilot && isNotStarted && depsReady && projectPath

  // Empty state
  if (!task && !autopilotSession) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">
          Select a task to view details
        </Typography>
      </Box>
    )
  }

  const hasPhases = !!autopilotSession

  return (
    <Box
      tabIndex={0}
      onKeyDown={handleKeyDown}
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* ═══ Header ═══ */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
        {onClose && (
          <IconButton size="small" onClick={onClose} aria-label="Close panel" sx={{ mr: 0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
        {isRunning && (
          <FiberManualRecordIcon
            aria-label="Session actively running"
            sx={{
              color: pv('status-done'),
              fontSize: 10,
              animation: 'livePulse 2s ease-in-out infinite',
              '@keyframes livePulse': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.4, transform: 'scale(0.8)' },
              },
              [reducedMotionQuery]: { animation: 'none' },
            }}
          />
        )}
        <Typography
          ref={headerRef}
          tabIndex={-1}
          variant="titleMedium"
          sx={{ outline: 'none', flexGrow: 1 }}
        >
          {name}
        </Typography>
        {autopilotSession?.project && (
          <Typography variant="labelMedium" color="text.secondary">
            {autopilotSession.project}
          </Typography>
        )}
        {(task?.autopilot || autopilotSession) && (
          <Chip
            label="autopilot"
            size="small"
            icon={<SmartToyIcon sx={{ fontSize: '14px !important' }} />}
            sx={{
              bgcolor: pva('info-main', 0.12),
              color: pv('info-main'),
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
        )}
        {task && (
          <Chip
            label={task.status === 'done' ? 'completed' : task.status}
            size="small"
            sx={{
              bgcolor: pv(`statusContainer-${task.status}`),
              color: pv(`onStatusContainer-${task.status}`),
            }}
          />
        )}
      </Box>

      {/* ═══ Prompt bar + Launch (only for not-started tasks) ═══ */}
      {isNotStarted && task?.prompt && (
        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', bgcolor: 'surfaceVariant', border: 'none', flex: 1 }}>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', flexGrow: 1, wordBreak: 'break-all' }}
            >
              {task.prompt}
            </Typography>
            <IconButton size="small" onClick={handleCopyPrompt} aria-label="Copy prompt">
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Paper>
          {showLaunch && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<SmartToyIcon />}
              onClick={handleLaunch}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              Launch Autopilot{task.pipeline === 'light' ? ' (light)' : ''}
            </Button>
          )}
        </Box>
      )}

      {/* ═══ Main body: sidebar (always) + content ═══ */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Sidebar: always present — phase stepper (when available) + docs + session history */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            width: 240,
            flexShrink: 0,
            overflowY: 'auto',
            borderRight: '1px solid',
            borderColor: 'divider',
            py: 2,
            px: 1.5,
          }}
        >
          {hasPhases && (
            <PhaseStepper phases={autopilotSession!.phases} mode="full" />
          )}

          {mergedArtifacts.length > 0 && (
            <Box sx={{ mt: hasPhases ? 2 : 0, pt: hasPhases ? 2 : 0, borderTop: hasPhases ? '1px solid' : 'none', borderColor: 'divider' }}>
              <Typography variant="labelMedium" color="text.secondary" sx={{ mb: 0.5 }}>
                Documents
              </Typography>
              <Stack spacing={0.5}>
                {mergedArtifacts.map((a) => (
                  <Chip
                    key={a.file}
                    label={a.name.replace('.md', '')}
                    icon={<DescriptionOutlinedIcon />}
                    size="small"
                    variant="outlined"
                    onClick={() => handleArtifactClick(a.file, a.source)}
                    sx={{ cursor: 'pointer', justifyContent: 'flex-start' }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Session History toggle */}
          {isCompleted && (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Chip
                label="Session History"
                icon={<HistoryIcon />}
                size="small"
                variant={showStream ? 'filled' : 'outlined'}
                color={showStream ? 'primary' : 'default'}
                onClick={() => setShowStream((v) => !v)}
                sx={{ cursor: 'pointer', justifyContent: 'flex-start', width: '100%' }}
              />
            </Box>
          )}

          {/* Previous phase gate */}
          {previousGate && (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="labelMedium" color="text.secondary" sx={{ mb: 0.5 }}>
                After gate
              </Typography>
              <Stack spacing={0.5}>
                <Chip
                  label={previousGate.name}
                  size="small"
                  variant="outlined"
                  sx={{
                    justifyContent: 'flex-start',
                    bgcolor: previousGate.passed ? pva('status-done', 0.1) : pva('warning-main', 0.1),
                    borderColor: previousGate.passed ? pva('status-done', 0.3) : pva('warning-main', 0.3),
                    color: previousGate.passed ? pv('status-done') : pv('warning-main'),
                  }}
                />
              </Stack>
            </Box>
          )}

          {/* Dependencies (depends on) */}
          {task?.depends && task.depends.length > 0 && (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="labelMedium" color="text.secondary" sx={{ mb: 0.5 }}>
                Depends on
              </Typography>
              <Stack spacing={0.5}>
                {task.depends.map((dep) => {
                  const depTask = allTasks?.get(dep)
                  const status = depTask?.status ?? 'pending'
                  return (
                    <Chip
                      key={dep}
                      label={dep}
                      size="small"
                      variant="outlined"
                      onClick={onSelectTask ? () => onSelectTask(dep) : undefined}
                      sx={{
                        justifyContent: 'flex-start',
                        cursor: onSelectTask ? 'pointer' : 'default',
                        bgcolor: pva(`status-${status}`, 0.1),
                        borderColor: pva(`status-${status}`, 0.3),
                        color: pv(`status-${status}`),
                      }}
                    />
                  )
                })}
              </Stack>
            </Box>
          )}

          {/* Dependents (required by) */}
          {dependents.length > 0 && (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="labelMedium" color="text.secondary" sx={{ mb: 0.5 }}>
                Required by
              </Typography>
              <Stack spacing={0.5}>
                {dependents.map((dep) => {
                  const depTask = allTasks?.get(dep)
                  const status = depTask?.status ?? 'pending'
                  return (
                    <Chip
                      key={dep}
                      label={dep}
                      size="small"
                      variant="outlined"
                      onClick={onSelectTask ? () => onSelectTask(dep) : undefined}
                      sx={{
                        justifyContent: 'flex-start',
                        cursor: onSelectTask ? 'pointer' : 'default',
                        bgcolor: pva(`status-${status}`, 0.1),
                        borderColor: pva(`status-${status}`, 0.3),
                        color: pv(`status-${status}`),
                      }}
                    />
                  )
                })}
              </Stack>
            </Box>
          )}

        </Box>

        {/* Content area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          {/* Mobile compact stepper */}
          {hasPhases && (
            <Box sx={{ display: { xs: 'block', md: 'none' }, px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <PhaseStepper phases={autopilotSession!.phases} mode="compact" />
              {isCompleted && (
                <Chip
                  label="Session History"
                  icon={<HistoryIcon />}
                  size="small"
                  variant={showStream ? 'filled' : 'outlined'}
                  color={showStream ? 'primary' : 'default'}
                  onClick={() => setShowStream((v) => !v)}
                  sx={{ cursor: 'pointer', mt: 1 }}
                />
              )}
            </Box>
          )}

          {/* Stream/Log viewer OR acceptance criteria */}
          {showStream && autopilotSession ? (
            <Suspense fallback={<Skeleton variant="rectangular" height={200} sx={{ m: 2, borderRadius: 1 }} />}>
              {hasStream === false
                ? <LogViewer task={autopilotSession.task} />
                : <StreamViewer task={autopilotSession.task} />
              }
            </Suspense>
          ) : (
            <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
              {/* Acceptance criteria */}
              {task?.acceptance && task.acceptance.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="labelMedium" color="text.secondary" sx={{ mb: 1 }}>
                    Acceptance Criteria
                  </Typography>
                  <List dense disablePadding>
                    {task.acceptance.map((item, i) => (
                      <ListItem key={i} disablePadding sx={{ alignItems: 'flex-start' }}>
                        <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                          <Checkbox size="small" checked={task.status === 'done'} disabled readOnly />
                        </ListItemIcon>
                        <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {/* Description */}
              {task?.description && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="labelMedium" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body2">{task.description}</Typography>
                </Box>
              )}

            </Box>
          )}
        </Box>
      </Box>

      {/* Artifact viewer dialog */}
      <Suspense fallback={<Skeleton />}>
        <ArtifactDialog
          url={artifactUrl}
          title={artifactFile ?? undefined}
          onClose={() => { setArtifactFile(null); setArtifactUrl(null) }}
        />
      </Suspense>

      <Snackbar
        open={snackbar !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
    </Box>
  )
}
