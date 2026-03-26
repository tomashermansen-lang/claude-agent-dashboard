# Claude Agent Dashboard

Real-time monitoring dashboard for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) pipelines. Track autonomous sessions, view execution plans, stream live output, and analyze metrics — all from your browser.

![Execution plan viewer](https://tomashermansen-lang.github.io/portfolio/screenshots/execution-graph-dashboard.png)

> For architecture deep-dives and design decisions, see the [portfolio write-up](https://tomashermansen-lang.github.io/portfolio/projects/agent-dashboard.html).

## Features

- **Autopilot monitor** — discovers active tmux-based autopilot runs, streams phases in real time
- **Session viewer** — live NDJSON streaming of tool calls, subagent activity, and phase transitions
- **Execution plans** — renders YAML/JSON plans as dependency trackers with progress and gate evaluation
- **Metrics (8 panels)** — tool usage, error rates, session lifecycle, permission friction, subagent utilization, file activity, task completion, activity timeline
- **Phase artifacts** — renders REQUIREMENTS.md, PLAN.md, QA_REPORT.md etc. inline

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, MUI v7, Recharts, SWR |
| Backend | Python 3 (stdlib + PyYAML), no database |
| Data | JSONL append-only event log via async hooks |
| Build | Vite 7, Vitest 4 |

## Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Python | 3.10+ | `brew install python3` |
| Node.js | 18+ | `brew install node` |
| jq | 1.6+ | `brew install jq` |
| git | 2.30+ | `xcode-select --install` |
| PyYAML | — | `pip3 install pyyaml` |

See [REQUIREMENTS.md](REQUIREMENTS.md) for the full list including frontend dependencies.

## Quick Start

```bash
git clone https://github.com/tomashermansen-lang/claude-agent-dashboard.git
cd claude-agent-dashboard
bash install.sh       # creates data dir, registers hooks
cd app && npm install  # install frontend deps
cd ..

# Start both servers
python3 serve.py &              # backend on :8787
cd app && npm run dev &         # frontend on :5175

# Open dashboard
open http://127.0.0.1:5175
```

Verify with:
```bash
bash verify.sh
```

## How It Works

The dashboard is **read-only** — it observes but never controls Claude Code.

1. An async hook (`hooks/report-status.sh`) fires on every Claude Code event (tool calls, subagent spawns, session start/stop)
2. The hook appends a JSONL line to `data/sessions.jsonl`
3. The Python backend reads JSONL + scans the filesystem for worktrees, plans, and autopilot logs
4. The React frontend polls API endpoints and renders in real time

**No database, no external APIs, localhost only.**

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions` | Current session states |
| `GET /api/plans` | Discovered projects with execution plans |
| `GET /api/plan?cwd=<path>` | Structured plan for a project |
| `GET /api/metrics?sid=&since=` | Session metrics (M1–M8) |
| `GET /api/autopilots` | Active autopilot sessions |
| `GET /api/autopilot/stream?task=&offset=` | Incremental NDJSON events |
| `GET /api/autopilot/log?task=&offset=` | Incremental log content |
| `GET /api/autopilot/artifacts?task=` | Phase artifacts list |
| `GET /api/autopilot/artifact?task=&file=` | Raw artifact content |

## Configuration

Set `PROJECTS_ROOT` to tell the dashboard where your projects live:

```bash
export PROJECTS_ROOT="$HOME/Projects"  # default: ~/Projekter
```

## Standalone vs With Pipeline

The dashboard works **standalone** — install.sh registers hooks directly.

For the full autonomous pipeline experience (autopilot, phase commits, specialist agents), also install the [Claude Code Pipeline](https://github.com/tomashermansen-lang/claude-code-pipeline).

## Screenshots

| Autopilot monitoring | Session metrics |
|---|---|
| ![Autopilot view](https://tomashermansen-lang.github.io/portfolio/screenshots/dashboard-autopilot.png) | ![Metrics view](https://tomashermansen-lang.github.io/portfolio/screenshots/dashboard-metrics.png) |

| Execution plan viewer |
|---|
| ![Plan viewer](https://tomashermansen-lang.github.io/portfolio/screenshots/execution-graph-dashboard.png) |

## License

[MIT](LICENSE)

## Author

**Tomas Hermansen** — [Portfolio](https://tomashermansen-lang.github.io/portfolio/) · [GitHub](https://github.com/tomashermansen-lang)
