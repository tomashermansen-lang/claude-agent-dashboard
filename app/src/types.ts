export type TaskStatus = 'pending' | 'wip' | 'done' | 'failed' | 'skipped' | 'blocked'

export type TaskStatusFilter = 'all' | 'wip' | 'blocked' | 'failed'

export type SessionStatus =
  | 'working'
  | 'needs_input'
  | 'idle'
  | 'completed'
  | 'stopped'
  | 'stale'
  | 'closed'

export interface Source {
  name: string
  path: string
}

export interface Gate {
  name: string
  checklist: string[]
  passed: boolean
  command?: string
}

export interface Task {
  id: string
  name: string
  description?: string
  status: TaskStatus
  depends?: string[]
  prompt?: string
  acceptance?: string[]
  parallel_group?: string
  last_updated?: string
  autopilot?: boolean
  pipeline?: string
  extensions?: Record<string, unknown>
}

export interface Phase {
  id: string
  name: string
  description?: string
  tasks: Task[]
  gate?: Gate
  extensions?: Record<string, unknown>
}

export interface Plan {
  schema_version: string
  name: string
  description?: string
  created?: string
  sources?: Source[]
  extensions?: Record<string, unknown>
  phases: Phase[]
}

export interface FlowInfo {
  feature: string
  phase: string
  phase_index: number
  total_phases: number
}

export interface Session {
  sid: string
  cwd: string
  worktree: string
  branch: string
  event: string
  type: string
  msg: string
  ts: string
  status: SessionStatus
  flow: FlowInfo | null
}

export interface ProjectSummary {
  project: string
  path: string
  phases: number
  progress: number
  has_plan: boolean
  lifecycle?: string
  plan_dir?: string
}

/* ═══ Autopilot Types ═══ */

export type AutopilotPhaseStatus = 'pending' | 'running' | 'completed' | 'failed'
export type AutopilotSessionStatus = 'running' | 'completed' | 'failed'

export interface AutopilotPhase {
  name: string
  status: AutopilotPhaseStatus
  duration_s: number | null
  cost: number | null
  artifact: string | null
}

export interface AutopilotSession {
  task: string
  project: string | null
  branch: string | null
  status: AutopilotSessionStatus
  phases: AutopilotPhase[]
  elapsed_s: number
  cost: number | null
  log_path: string | null
}

export interface AutopilotSummary {
  task: string
  project: string
  branch: string
  workdir: string
  start_ts: string
  end_ts: string
  duration_s: number
  phases: AutopilotPhase[]
  // Note: 'success' (not 'completed') because summaries are only written post-completion.
  // AutopilotSessionStatus uses 'completed' for the live view. The asymmetry is intentional.
  status: 'success' | 'failed' | 'interrupted'
}

/* ═══ Metrics Types (M1–M8) ═══ */

export interface ToolUsageMetrics {
  by_tool: Record<string, number>
  by_session: Record<string, { count: number; rate: number }>
  most_used: string
  total: number
}

export interface ErrorTrackingMetrics {
  total_errors: number
  by_tool: Record<string, number>
  by_tool_detail: Record<string, { failures: number; interrupts: number }>
  by_session: Record<string, { errors: number; rate: number }>
  interrupts: number
  failures: number
  timeline: Array<{ ts: string; sid: string; tool: string; is_interrupt: boolean }>
}

export interface SessionLifecycleMetrics {
  sessions: Array<{
    sid: string; start: string; end: string; duration_s: number
    model: string; source: string; end_reason: string
  }>
  model_distribution: Record<string, number>
  source_distribution: Record<string, number>
  end_reasons: Record<string, number>
  concurrency_timeline: Array<{ ts: string; concurrent: number }>
}

export interface PermissionFrictionMetrics {
  total_prompts: number
  by_tool: Record<string, number>
  by_tool_mode: Record<string, Record<string, number>>
  by_session: Record<string, { prompts: number; blocked_s: number }>
  mode_distribution: Record<string, number>
  blocked_durations: Array<{ sid: string; tuid: string; duration_s: number }>
  has_tuid_data: boolean
  timeline: Array<{ ts: string; sid: string; tool: string; mode: string; msg: string }>
}

export interface SubagentUtilizationMetrics {
  total_spawned: number
  by_type: Record<string, number>
  by_session: Record<string, number>
  peak_concurrent: number
  durations: Array<{ aid: string; atype: string; duration_s: number }>
  running: Array<{ aid: string; atype: string; start: string }>
}

export interface FileActivityMetrics {
  files: Array<{
    path: string; sessions: string[]; access: 'edit' | 'read'
    last_ts: string
  }>
  conflicts: Array<{ path: string; sessions: string[] }>
  summary: { total: number; edited: number; read_only: number }
  has_fp_data: boolean
}

export interface TaskCompletionMetrics {
  total: number
  by_session: Record<string, number>
  tasks: Array<{ sid: string; subject: string; ts: string }>
  rates: Record<string, number>
  total_responses: number
  responses_by_session: Record<string, number>
}

export interface ActivityTimelineMetrics {
  sessions: Array<{
    sid: string; label: string; start: string; end: string
    events: Array<{ ts: string; category: string }>
    idle_gaps: Array<{ start: string; end: string; duration_s: number }>
    density: number
  }>
}

export interface MetricsResponse {
  tool_usage: ToolUsageMetrics
  error_tracking: ErrorTrackingMetrics
  session_lifecycle: SessionLifecycleMetrics
  permission_friction: PermissionFrictionMetrics
  subagent_utilization: SubagentUtilizationMetrics
  file_activity: FileActivityMetrics
  task_completion: TaskCompletionMetrics
  activity_timeline: ActivityTimelineMetrics
}
