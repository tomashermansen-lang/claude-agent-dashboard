import { useState, useRef, useEffect, useCallback } from 'react'

const POLL_INTERVAL = 1500

export interface StreamContentBlock {
  type: 'text' | 'tool_use' | 'thinking' | 'tool_result'
  text?: string
  thinking?: string
  name?: string
  input?: Record<string, unknown>
  content?: string | unknown[]
}

export interface StreamEvent {
  type: 'phase' | 'assistant' | 'user' | 'result' | 'orchestrator'
  // Phase events
  phase?: string
  status?: string
  duration_s?: number
  ts?: string
  // Assistant/user events
  message?: {
    content: StreamContentBlock[]
  }
  // Orchestrator events
  msg?: string
  // Result events
  subtype?: string
  total_cost_usd?: number
  duration_ms?: number
  num_turns?: number
}

interface StreamState {
  events: StreamEvent[]
  isLive: boolean
  hasStream: boolean | null
}

export function useAutopilotStream(task: string | null): StreamState {
  const offsetRef = useRef(0)
  const eventsRef = useRef<StreamEvent[]>([])
  const [displayEvents, setDisplayEvents] = useState<StreamEvent[]>([])
  const [isLive, setIsLive] = useState(false)
  const [hasStream, setHasStream] = useState<boolean | null>(null)
  const consecutiveEmptyRef = useRef(0)

  const reset = useCallback(() => {
    offsetRef.current = 0
    eventsRef.current = []
    consecutiveEmptyRef.current = 0
    setDisplayEvents([])
    setIsLive(false)
    setHasStream(null)
  }, [])

  // Reset when task changes
  useEffect(() => {
    reset()
  }, [task, reset])

  useEffect(() => {
    if (!task) return

    let cancelled = false
    const controller = new AbortController()

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/autopilot/stream?task=${encodeURIComponent(task)}&offset=${offsetRef.current}`,
          { signal: controller.signal }
        )
        if (cancelled) return

        if (res.status === 404) {
          setHasStream(false)
          return
        }
        if (!res.ok) return

        const data = await res.json()
        if (cancelled) return

        setHasStream(true)
        const newEvents: StreamEvent[] = data.events
        offsetRef.current = data.offset

        if (newEvents.length > 0) {
          consecutiveEmptyRef.current = 0
          eventsRef.current = eventsRef.current.concat(newEvents)
          setDisplayEvents([...eventsRef.current])
          setIsLive(true)
        } else {
          consecutiveEmptyRef.current++
          // After 5 consecutive empty polls (~7.5s), consider stream not live
          if (consecutiveEmptyRef.current >= 5) {
            setIsLive(false)
          }
        }
      } catch {
        // Ignore fetch errors and aborts silently
      }
    }

    const id = setInterval(poll, POLL_INTERVAL)
    poll()

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(id)
    }
  }, [task])

  return { events: displayEvents, isLive, hasStream }
}
