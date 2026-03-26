# Requirements

The dashboard runs on macOS, Linux, and WSL. The companion [Claude Code Pipeline](https://github.com/tomashermansen-lang/claude-code-pipeline) is macOS-only, but the dashboard itself has no platform restriction.

## Required

| Tool | Min version | Install | Purpose |
|------|-------------|---------|---------|
| Python | 3.10+ | `brew install python3` | Backend server |
| Node.js | 18+ | `brew install node` | Frontend build + dev server |
| npm | 9+ | Bundled with Node.js | Package management |
| jq | 1.6+ | `brew install jq` | Hook event parsing |
| git | 2.30+ | `xcode-select --install` | Worktree and plan discovery |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Latest | `npm i -g @anthropic-ai/claude-code` | Source of session events via hooks |

## Python Dependencies

The backend uses Python stdlib only, with one optional dependency:

| Package | Required | Install | Purpose |
|---------|----------|---------|---------|
| PyYAML | Optional | `pip3 install pyyaml` | YAML execution plan parsing |

Without PyYAML, the dashboard still works — it just can't render YAML-format execution plans (JSON plans work regardless).

## Frontend Dependencies

Installed automatically via `npm install` in the `app/` directory:

| Package | Version | Purpose |
|---------|---------|---------|
| React | 19 | UI framework |
| MUI | v7 | Component library |
| MUI X Data Grid | v8 | Data tables |
| Recharts | v3 | Charts and metrics |
| SWR | v2 | Data fetching and caching |
| TypeScript | 5.9 | Type safety |
| Vite | 7 | Build tool and dev server |
| Vitest | 4 | Test framework |

## Quick Install

```bash
git clone https://github.com/tomashermansen-lang/claude-agent-dashboard.git
cd claude-agent-dashboard
bash install.sh          # creates data dir, registers hooks
cd app && npm install    # install frontend dependencies
```

## Optional

| Tool | Install | Purpose |
|------|---------|---------|
| [Claude Code Pipeline](https://github.com/tomashermansen-lang/claude-code-pipeline) | See its README | Full autopilot monitoring, phase tracking |
| SonarQube | Docker | Referenced in execution plan status (not used by dashboard directly) |

## Verification

```bash
bash verify.sh
```

Checks prerequisites, data directory, frontend deps, hook registration, and runs a backend smoke test.
