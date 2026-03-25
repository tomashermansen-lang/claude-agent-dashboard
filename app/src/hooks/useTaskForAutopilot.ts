import { useState, useEffect } from 'react'
import type { Task, Plan, ProjectSummary, AutopilotSession } from '../types'

/**
 * Looks up the matching execution plan Task for an autopilot session.
 * Fetches /api/plans to find the project, then /api/plan to find the task.
 */
export function useTaskForAutopilot(session: AutopilotSession | null): {
  task: Task | null
  projectPath: string | null
  loading: boolean
} {
  const [task, setTask] = useState<Task | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const sessionTask = session?.task ?? null
  const sessionProject = session?.project ?? null

  useEffect(() => {
    if (!sessionTask || !sessionProject) {
      setTask(null)
      setProjectPath(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch('/api/plans')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ProjectSummary[]>
      })
      .then((plans) => {
        const match = plans.find((p) =>
          p.project.toLowerCase().startsWith(sessionProject.toLowerCase()) ||
          p.path.toLowerCase().includes(sessionProject.toLowerCase()),
        )
        if (!match?.plan_dir) throw new Error('No plan found')
        if (!cancelled) setProjectPath(match.path)
        return fetch(`/api/plan?cwd=${encodeURIComponent(match.plan_dir)}`)
      })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Plan>
      })
      .then((plan) => {
        if (cancelled) return
        for (const phase of plan.phases) {
          const found = phase.tasks.find((t) => t.id === sessionTask)
          if (found) {
            setTask(found)
            setLoading(false)
            return
          }
        }
        setTask(null)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setTask(null)
          setProjectPath(null)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [sessionTask, sessionProject])

  return { task, projectPath, loading }
}
