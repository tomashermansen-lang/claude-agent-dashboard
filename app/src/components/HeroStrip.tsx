import { useMemo, useState, useEffect, lazy, Suspense } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import SegmentedProgress from './SegmentedProgress'
import { flattenTasks, computeProgressPct } from '../utils/planMetrics'
import { pva } from '../utils/cssVars'
import type { Plan, Session, Task } from '../types'

const ArtifactDialog = lazy(() => import('./autopilot/ArtifactDialog'))

const PLAN_DOCS = [
  { label: 'Execution Plan', file: 'execution-plan.yaml' },
  { label: 'Execution Guide', file: 'EXECUTION_GUIDE.md', alt: 'EXECUTION_PLAN.md' },
  { label: 'Setup Plan', file: 'SETUP_PLAN.md' },
  { label: 'Deferred', file: 'DEFERRED.md' },
]

interface HeroStripProps {
  plan: Plan
  sessions: Session[]
  sessionCount: number
  planDir?: string
}

export default function HeroStrip({ plan, sessions, sessionCount, planDir }: HeroStripProps) {
  const allTasks = flattenTasks(plan)
  const pct = computeProgressPct(plan)
  const [artifactUrl, setArtifactUrl] = useState<string | null>(null)
  const [artifactTitle, setArtifactTitle] = useState<string | undefined>(undefined)
  const [availableDocs, setAvailableDocs] = useState<Set<string>>(new Set())

  // Probe which plan-level docs exist (check alt filenames too)
  const [resolvedFiles, setResolvedFiles] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!planDir) return
    let cancelled = false
    const checks = PLAN_DOCS.map(async (doc) => {
      const res = await fetch(`/api/plan/artifact?plan_dir=${encodeURIComponent(planDir)}&file=${encodeURIComponent(doc.file)}`).catch(() => null)
      if (res?.ok) return [doc.file, doc.file] as const
      if (doc.alt) {
        const altRes = await fetch(`/api/plan/artifact?plan_dir=${encodeURIComponent(planDir)}&file=${encodeURIComponent(doc.alt)}`).catch(() => null)
        if (altRes?.ok) return [doc.file, doc.alt] as const
      }
      return null
    })
    Promise.all(checks).then((results) => {
      if (!cancelled) {
        const map = new Map<string, string>()
        for (const r of results) {
          if (r) map.set(r[0], r[1])
        }
        setAvailableDocs(new Set(map.keys()))
        setResolvedFiles(map)
      }
    })
    return () => { cancelled = true }
  }, [planDir])

  // Cross-reference sessions with tasks: if a session is working on a branch
  // whose feature matches a task ID, treat that task as live WIP
  const { counts, liveTasks } = useMemo(() => {
    const workingFeatures = new Set(
      sessions
        .filter((s) => s.status === 'working' || s.status === 'needs_input')
        .map((s) => s.branch.split('/').pop() ?? ''),
    )

    const result: Record<string, number> = { total: allTasks.length, done: 0, wip: 0, failed: 0, pending: 0, skipped: 0 }
    const augmented: Task[] = allTasks.map((t) => {
      // Promote pending → wip if a working session matches this task
      if (t.status === 'pending' && workingFeatures.has(t.id)) {
        result.wip++
        return { ...t, status: 'wip' as const }
      }
      result[t.status] = (result[t.status] ?? 0) + 1
      return t
    })

    return { counts: result, liveTasks: augmented }
  }, [allTasks, sessions])

  const handleDocClick = (file: string, label: string) => {
    if (!planDir) return
    const resolved = resolvedFiles.get(file) ?? file
    const url = `/api/plan/artifact?plan_dir=${encodeURIComponent(planDir)}&file=${encodeURIComponent(resolved)}`
    setArtifactUrl(url)
    setArtifactTitle(label)
  }

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          bgcolor: pva('primary-main', 0.06),
          borderRadius: 1,
          p: { xs: 2, md: 3 },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="headlineSmall" component="h2">
              {plan.name}
            </Typography>
            {planDir && (
              <Stack direction="row" spacing={0.5}>
                {PLAN_DOCS.map((doc) => {
                  const exists = availableDocs.has(doc.file)
                  return (
                    <Chip
                      key={doc.file}
                      label={doc.label}
                      icon={<DescriptionOutlinedIcon />}
                      size="small"
                      variant="outlined"
                      disabled={!exists}
                      onClick={exists ? () => handleDocClick(doc.file, doc.label) : undefined}
                      sx={exists ? { cursor: 'pointer' } : { opacity: 0.4 }}
                    />
                  )
                })}
              </Stack>
            )}
          </Box>
          <Typography variant="displayMedium" component="span" sx={{ fontSize: { xs: '1.8rem', md: '2.8rem' }, lineHeight: 1 }}>
            {pct}%
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}>
          {plan.description && (
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {plan.description}
            </Typography>
          )}
          <Typography variant="labelMedium" color="text.secondary" sx={{ flexShrink: 0, ml: 2 }}>
            {counts.done}/{counts.total} tasks
          </Typography>
        </Box>

        <Box sx={{ mb: 1.5 }}>
          <SegmentedProgress tasks={liveTasks} />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="labelSmall" color="text.secondary">
            done ({counts.done}) · wip ({counts.wip}) · pending ({counts.pending})
          </Typography>
          {sessionCount > 0 && (
            <Typography variant="labelSmall" color="text.secondary">
              {sessionCount} working
            </Typography>
          )}
        </Box>
      </Paper>

      <Suspense fallback={<Skeleton />}>
        <ArtifactDialog
          url={artifactUrl}
          title={artifactTitle}
          onClose={() => { setArtifactUrl(null); setArtifactTitle(undefined) }}
        />
      </Suspense>
    </>
  )
}
