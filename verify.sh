#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Agent Dashboard — Verify Installation
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

DASHBOARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERRORS=0
WARNINGS=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }

echo -e "${BOLD}Agent Dashboard — Verify${NC}"
echo "========================="
echo ""

# ── Prerequisites ───────────────────────────────────────
echo -e "${BOLD}Prerequisites${NC}"
command -v python3 &>/dev/null && pass "python3" || fail "python3 not found"
command -v node &>/dev/null && pass "node $(node --version 2>/dev/null)" || fail "node not found"
command -v npm &>/dev/null && pass "npm" || fail "npm not found"
command -v jq &>/dev/null && pass "jq" || fail "jq not found"
command -v git &>/dev/null && pass "git" || fail "git not found"
echo ""

# ── Data directory ──────────────────────────────────────
echo -e "${BOLD}Data directory${NC}"
if [[ -d "$DASHBOARD_DIR/data" ]]; then
  PERMS=$(stat -f "%Lp" "$DASHBOARD_DIR/data" 2>/dev/null || stat -c "%a" "$DASHBOARD_DIR/data" 2>/dev/null)
  if [[ "$PERMS" == "700" ]]; then
    pass "data/ exists (mode 700)"
  else
    warn "data/ exists but mode is $PERMS (expected 700)"
  fi
else
  fail "data/ directory missing — run install.sh"
fi
echo ""

# ── Frontend ────────────────────────────────────────────
echo -e "${BOLD}Frontend${NC}"
if [[ -d "$DASHBOARD_DIR/app/node_modules" ]]; then
  pass "node_modules installed"
else
  fail "node_modules missing — run: cd app && npm install"
fi

if [[ -f "$DASHBOARD_DIR/app/package.json" ]]; then
  pass "package.json exists"
else
  fail "package.json missing"
fi
echo ""

# ── Backend ─────────────────────────────────────────────
echo -e "${BOLD}Backend${NC}"
if [[ -f "$DASHBOARD_DIR/serve.py" ]]; then
  pass "serve.py exists"
else
  fail "serve.py missing"
fi

if python3 -c "import yaml" 2>/dev/null; then
  pass "PyYAML available"
else
  warn "PyYAML not installed — YAML plan parsing will be disabled"
  echo "    Install: pip3 install pyyaml"
fi
echo ""

# ── Hook registration ───────────────────────────────────
echo -e "${BOLD}Hook registration${NC}"
SETTINGS="$HOME/.claude/settings.json"
HOOK_PATH="$DASHBOARD_DIR/hooks/report-status.sh"
if [[ -f "$SETTINGS" ]] && jq -e --arg cmd "bash $HOOK_PATH" '
  .hooks | to_entries | map(.value[] | .hooks[]? | select(.command == $cmd)) | length > 0
' "$SETTINGS" &>/dev/null; then
  pass "Dashboard hook registered in settings.json"
else
  warn "Dashboard hook not registered — run install.sh to enable session monitoring"
fi
echo ""

# ── Quick smoke test ────────────────────────────────────
echo -e "${BOLD}Smoke test${NC}"
# Start server briefly to check it responds
python3 "$DASHBOARD_DIR/serve.py" &
SERVER_PID=$!
sleep 2

if curl -sf "http://127.0.0.1:8787/api/sessions" &>/dev/null; then
  pass "Backend responds on :8787"
else
  warn "Backend did not respond — check serve.py logs"
fi

kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
echo ""

# ── Summary ─────────────────────────────────────────────
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
  echo -e "${BOLD}${GREEN}  All checks passed!${NC}"
elif [[ $ERRORS -eq 0 ]]; then
  echo -e "${BOLD}${YELLOW}  Passed with $WARNINGS warning(s)${NC}"
else
  echo -e "${BOLD}${RED}  $ERRORS error(s), $WARNINGS warning(s)${NC}"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
exit $ERRORS
