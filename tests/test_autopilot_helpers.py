"""Tests for server/autopilot_helpers.py — log parsing, discovery, incremental read.

See also: app/src/__tests__/useAutopilotLog.test.ts for frontend hook tests
(covers Strict Mode double-mount, task reset, stale closure guard).

Uses unittest (stdlib) — no pytest dependency required.
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.autopilot_helpers import (
    _extract_cost,
    _KNOWN_ARTIFACTS,
    _parse_header,
    _resolve_log_path,
    _resolve_stream_path,
    discover_autopilots,
    list_autopilot_artifacts,
    load_summary,
    parse_log_phases,
    read_log_incremental,
)

# ─── Fixtures ────────────────────────────────────────────────────────

SAMPLE_HEADER = """\
╔══════════════════════════════════════════╗
║  AUTOPILOT                               ║
╠══════════════════════════════════════════╣
║  Task:     auth-module                   ║
║  Project:  OIH                           ║
║  Branch:   feature/auth-module           ║
║  Mode:     full                          ║
╚══════════════════════════════════════════╝
"""

SAMPLE_LOG = """\
{header}
[10:00:00] Running: /ba flow autopilot auth-module
✓ Requirements written
Phase completed in 120s
Total cost: $0.42

[10:02:00] Running: /plan flow autopilot auth-module
✓ Architecture plan written
Phase completed in 180s

[10:05:00] Running: /team-review flow autopilot auth-module
⚠ 3 findings (1 WARNING)
Phase completed in 240s

[10:09:00] Running: /implement flow autopilot auth-module

AUTOPILOT COMPLETE
Total duration: 540s
""".format(header=SAMPLE_HEADER)

# autopilot.sh actual log format (timestamped, no box header)
SAMPLE_AUTOPILOTSH_HEADER = """\
[15:11:14] Autopilot started for task: auth-module
[15:11:14] Worktree: /Users/test/Projekter/OIH-auth-module
[15:11:14] Branch: feature/auth-module
[15:11:14] Full mode: true
[15:11:14] Pipeline: full
"""

SAMPLE_AUTOPILOTSH_LOG = """\
{header}[15:11:30] Sending: /ba flow autopilot auth-module
[15:11:30] Waiting for phase completion...
[15:14:30] Phase checkpoint reached
[15:14:30] Auto-approved checkpoint with: plan
[15:14:35] Sending: /plan flow autopilot auth-module
[15:18:00] Phase checkpoint reached
""".format(header=SAMPLE_AUTOPILOTSH_HEADER)


class TmpDirMixin:
    """Mixin that provides a fresh temp directory per test (replaces pytest tmp_path)."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp(prefix="autopilot-test-")
        self.tmp_path = Path(self._tmp_dir)

    def tearDown(self):
        shutil.rmtree(self._tmp_dir, ignore_errors=True)


# ─── parse_log_phases ────────────────────────────────────────────────

class TestParseLogPhases(TmpDirMixin, unittest.TestCase):
    def test_parse_phase_start(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("[10:00:00] Running: /ba flow autopilot task\nWorking...\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(len(phases), 1)
        self.assertEqual(phases[0]["name"], "BA")
        self.assertEqual(phases[0]["status"], "running")

    def test_parse_phase_completion(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("[10:00:00] Running: /ba flow autopilot task\nPhase completed in 42s\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(len(phases), 1)
        self.assertEqual(phases[0]["duration_s"], 42)
        self.assertEqual(phases[0]["status"], "completed")

    def test_parse_success_marker(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("[10:00:00] Running: /ba flow autopilot task\n✓ Requirements written\nPhase completed in 10s\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(phases[0]["status"], "completed")

    def test_parse_warning_no_status_change(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("[10:00:00] Running: /review flow autopilot task\n⚠ 3 findings\nPhase completed in 10s\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(phases[0]["status"], "completed")

    def test_parse_autopilot_complete(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text(SAMPLE_LOG)
        phases = parse_log_phases(str(log))
        completed_names = [p["name"] for p in phases if p["status"] == "completed"]
        self.assertIn("BA", completed_names)
        self.assertIn("Plan", completed_names)
        self.assertIn("Team Review", completed_names)

    def test_parse_autopilot_failed(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("[10:00:00] Running: /ba flow autopilot task\nError occurred\nAUTOPILOT FAILED\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(phases[0]["status"], "failed")

    def test_empty_log(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("")
        phases = parse_log_phases(str(log))
        self.assertEqual(phases, [])

    def test_malformed_log(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("random text\nno phase markers\njust garbage\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(phases, [])

    def test_multiple_phases_ordered(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text(SAMPLE_LOG)
        phases = parse_log_phases(str(log))
        names = [p["name"] for p in phases]
        self.assertEqual(names, ["BA", "Plan", "Team Review", "Implement"])

    def test_phase_cost_extracted(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("[10:00:00] Running: /ba flow autopilot task\nTotal cost: $0.42\nPhase completed in 10s\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(phases[0]["cost"], 0.42)

    def test_phase_artifact_mapping(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("[10:00:00] Running: /ba flow autopilot task\nPhase completed in 10s\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(phases[0]["artifact"], "REQUIREMENTS.md")

    # ─── autopilot.sh format ─────────────────────────────────────────

    def test_sending_format_phase_start(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("Sending: /ba flow autopilot my-task\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(len(phases), 1)
        self.assertEqual(phases[0]["name"], "BA")
        self.assertEqual(phases[0]["status"], "running")

    def test_checkpoint_format_phase_completion(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("Sending: /ba flow autopilot my-task\nPhase checkpoint reached\n")
        phases = parse_log_phases(str(log))
        self.assertEqual(phases[0]["status"], "completed")

    def test_autopilotsh_multiple_phases(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text(SAMPLE_AUTOPILOTSH_LOG)
        phases = parse_log_phases(str(log))
        names = [p["name"] for p in phases]
        self.assertEqual(names, ["BA", "Plan"])
        self.assertEqual(phases[0]["status"], "completed")
        self.assertEqual(phases[1]["status"], "completed")


# ─── _parse_header ───────────────────────────────────────────────────

class TestParseHeader(unittest.TestCase):
    def test_extract_fields(self):
        lines = SAMPLE_HEADER.splitlines()
        header = _parse_header(lines)
        self.assertEqual(header["task"], "auth-module")
        self.assertEqual(header["project"], "OIH")
        self.assertEqual(header["branch"], "feature/auth-module")

    def test_missing_fields(self):
        header = _parse_header(["no header here", "just text"])
        self.assertIsNone(header["task"])
        self.assertIsNone(header["project"])
        self.assertIsNone(header["branch"])

    def test_autopilotsh_timestamped_header(self):
        lines = SAMPLE_AUTOPILOTSH_HEADER.splitlines()
        header = _parse_header(lines)
        self.assertEqual(header["task"], "auth-module")
        self.assertEqual(header["project"], "OIH")
        self.assertEqual(header["branch"], "feature/auth-module")


# ─── _extract_cost ───────────────────────────────────────────────────

class TestExtractCost(unittest.TestCase):
    def test_dollar_amount(self):
        self.assertEqual(_extract_cost("Total cost: $0.42"), 0.42)

    def test_zero_cost(self):
        self.assertEqual(_extract_cost("Total cost: $0.00"), 0.0)

    def test_no_cost(self):
        self.assertIsNone(_extract_cost("No cost info here"))

    def test_multiple_amounts_first_match(self):
        self.assertEqual(_extract_cost("Cost: $0.42 and $1.23"), 0.42)


# ─── read_log_incremental ───────────────────────────────────────────

class TestReadLogIncremental(TmpDirMixin, unittest.TestCase):
    def test_read_from_zero(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("line1\nline2\n")
        content, offset = read_log_incremental(str(log), 0)
        self.assertIn("line1", content)
        self.assertIn("line2", content)
        self.assertEqual(offset, len(log.read_bytes()))

    def test_read_from_offset(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("line1\nline2\nline3\n")
        first_line_len = len("line1\n".encode())
        content, offset = read_log_incremental(str(log), first_line_len)
        self.assertNotIn("line1", content)
        self.assertIn("line2", content)

    def test_path_traversal_blocked(self):
        result = read_log_incremental("/etc/passwd", 0)
        self.assertIsNone(result)

    def test_nonexistent_file(self):
        result = read_log_incremental(str(self.tmp_path / "nonexistent.log"), 0)
        self.assertIsNone(result)

    def test_ansi_codes_stripped(self):
        log = self.tmp_path / "autopilot.log"
        log.write_text("\x1b[32mgreen\x1b[0m normal\n")
        content, _ = read_log_incremental(str(log), 0)
        self.assertNotIn("\x1b[", content)
        self.assertIn("green", content)


# ─── _resolve_log_path ──────────────────────────────────────────────

class TestResolveLogPath(TmpDirMixin, unittest.TestCase):
    def test_finds_inprogress_log(self):
        feature_dir = self.tmp_path / "docs" / "INPROGRESS_Feature_my-task"
        feature_dir.mkdir(parents=True)
        log = feature_dir / "autopilot.log"
        log.write_text("test log")
        result = _resolve_log_path("my-task", search_roots=[str(self.tmp_path)])
        self.assertIsNotNone(result)
        self.assertTrue(str(result).endswith("autopilot.log"))

    def test_finds_done_log(self):
        feature_dir = self.tmp_path / "docs" / "DONE_Feature_old-task"
        feature_dir.mkdir(parents=True)
        log = feature_dir / "autopilot.log"
        log.write_text("test log")
        result = _resolve_log_path("old-task", search_roots=[str(self.tmp_path)])
        self.assertIsNotNone(result)
        self.assertTrue(str(result).endswith("autopilot.log"))

    def test_returns_none_when_missing(self):
        result = _resolve_log_path("nonexistent-task", search_roots=[str(self.tmp_path)])
        self.assertIsNone(result)


class TestResolveStreamPath(TmpDirMixin, unittest.TestCase):
    def test_finds_inprogress_stream(self):
        feature_dir = self.tmp_path / "docs" / "INPROGRESS_Feature_my-task"
        feature_dir.mkdir(parents=True)
        stream = feature_dir / "autopilot-stream.ndjson"
        stream.write_text('{"type":"phase"}\n')
        result = _resolve_stream_path("my-task", search_roots=[str(self.tmp_path)])
        self.assertIsNotNone(result)
        self.assertTrue(str(result).endswith("autopilot-stream.ndjson"))

    def test_finds_done_stream(self):
        feature_dir = self.tmp_path / "docs" / "DONE_Feature_old-task"
        feature_dir.mkdir(parents=True)
        stream = feature_dir / "autopilot-stream.ndjson"
        stream.write_text('{"type":"phase"}\n')
        result = _resolve_stream_path("old-task", search_roots=[str(self.tmp_path)])
        self.assertIsNotNone(result)
        self.assertTrue(str(result).endswith("autopilot-stream.ndjson"))

    def test_returns_none_when_missing(self):
        result = _resolve_stream_path("nonexistent", search_roots=[str(self.tmp_path)])
        self.assertIsNone(result)


# ─── discover_autopilots ────────────────────────────────────────────

class TestDiscoverAutopilots(TmpDirMixin, unittest.TestCase):
    def _discover_with_roots(self, roots):
        """Call discover_autopilots with patched project roots."""
        import server.autopilot_helpers as ah
        original = ah._get_all_project_roots
        ah._get_all_project_roots = lambda: roots
        try:
            # Bypass cache by using _tmux_cmd (forces fresh scan)
            return discover_autopilots(_tmux_cmd=["echo", ""])
        finally:
            ah._get_all_project_roots = original

    def test_no_log_files(self):
        """Empty project root returns no sessions."""
        (self.tmp_path / "docs").mkdir()
        sessions = self._discover_with_roots([str(self.tmp_path)])
        self.assertEqual(sessions, [])

    def test_discovers_running_session(self):
        """Finds a session from an autopilot.log in INPROGRESS_Feature_ dir."""
        feature = self.tmp_path / "docs" / "INPROGRESS_Feature_test-task"
        feature.mkdir(parents=True)
        log = feature / "autopilot.log"
        log.write_text("[10:00:00] Running: /ba flow autopilot test-task\n")
        sessions = self._discover_with_roots([str(self.tmp_path)])
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["task"], "test-task")

    def test_task_name_validation(self):
        """Rejects task names with path traversal characters."""
        feature = self.tmp_path / "docs" / "INPROGRESS_Feature_../../etc"
        try:
            feature.mkdir(parents=True)
            (feature / "autopilot.log").write_text("test")
        except (OSError, ValueError):
            pass  # OS rejects the path — that's fine, the task is invalid
        sessions = self._discover_with_roots([str(self.tmp_path)])
        self.assertEqual(len(sessions), 0)

    def test_discovers_done_feature_with_stream(self):
        """Finds a completed session from DONE_Feature_ with NDJSON stream."""
        feature = self.tmp_path / "docs" / "DONE_Feature_my-done-task"
        feature.mkdir(parents=True)
        stream = feature / "autopilot-stream.ndjson"
        stream.write_text('{"type":"phase","phase":"BA","status":"completed","duration_s":30}\n')
        sessions = self._discover_with_roots([str(self.tmp_path)])
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["task"], "my-done-task")
        self.assertEqual(sessions[0]["status"], "completed")

    def test_discovers_done_feature_with_log(self):
        """Finds a completed session from DONE_Feature_ with text log."""
        feature = self.tmp_path / "docs" / "DONE_Feature_old-task"
        feature.mkdir(parents=True)
        log = feature / "autopilot.log"
        log.write_text("[10:00:00] Running: /ba flow autopilot old-task\nPhase completed in 42s\nAUTOPILOT COMPLETE\n")
        sessions = self._discover_with_roots([str(self.tmp_path)])
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["task"], "old-task")
        self.assertEqual(sessions[0]["status"], "completed")

    def test_done_feature_always_completed_status(self):
        """DONE_Feature_ sessions are always 'completed', never 'running'."""
        feature = self.tmp_path / "docs" / "DONE_Feature_recent-task"
        feature.mkdir(parents=True)
        stream = feature / "autopilot-stream.ndjson"
        # Write a stream file that would be "running" if in INPROGRESS
        stream.write_text('{"type":"phase","phase":"BA","status":"running"}\n')
        sessions = self._discover_with_roots([str(self.tmp_path)])
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["status"], "completed")

    def test_done_feature_phases_all_completed(self):
        """All phases in DONE_Feature_ sessions should be 'completed', not 'running'."""
        feature = self.tmp_path / "docs" / "DONE_Feature_finished-task"
        feature.mkdir(parents=True)
        stream = feature / "autopilot-stream.ndjson"
        stream.write_text(
            '{"type":"phase","phase":"BA","status":"completed","duration_s":30}\n'
            '{"type":"phase","phase":"Plan","status":"completed","duration_s":60}\n'
            '{"type":"phase","phase":"Commit & Merge","status":"running"}\n'
        )
        sessions = self._discover_with_roots([str(self.tmp_path)])
        self.assertEqual(len(sessions), 1)
        for phase in sessions[0]["phases"]:
            self.assertEqual(
                phase["status"], "completed",
                f"Phase '{phase['name']}' should be 'completed' in DONE feature"
            )


# ─── load_summary ───────────────────────────────────────────────────

class TestLoadSummary(TmpDirMixin, unittest.TestCase):
    def test_load_valid_summary(self):
        feature_dir = self.tmp_path / "docs" / "INPROGRESS_Feature_my-task"
        feature_dir.mkdir(parents=True)
        summary = {
            "task": "my-task",
            "project": "Test",
            "status": "success",
            "phases": [],
            "duration_s": 100,
        }
        (feature_dir / "autopilot-summary.json").write_text(json.dumps(summary))
        result = load_summary("my-task", search_roots=[str(self.tmp_path)])
        self.assertIsNotNone(result)
        self.assertEqual(result["task"], "my-task")

    def test_no_summary_file(self):
        result = load_summary("nonexistent", search_roots=[str(self.tmp_path)])
        self.assertIsNone(result)


class TestKnownArtifacts(unittest.TestCase):
    def test_static_analysis_in_known_artifacts(self):
        """STATIC_ANALYSIS.md must be in _KNOWN_ARTIFACTS."""
        self.assertIn("STATIC_ANALYSIS.md", _KNOWN_ARTIFACTS)

    def test_lists_static_analysis_artifact(self):
        """list_autopilot_artifacts should return STATIC_ANALYSIS.md when present."""
        import tempfile
        import shutil
        tmp = Path(tempfile.mkdtemp(prefix="artifact-test-"))
        try:
            feature_dir = tmp / "docs" / "DONE_Feature_test-sa"
            feature_dir.mkdir(parents=True)
            (feature_dir / "STATIC_ANALYSIS.md").write_text("# Static Analysis\n")
            (feature_dir / "REQUIREMENTS.md").write_text("# Requirements\n")
            import server.autopilot_helpers as ah
            original = ah._get_all_project_roots
            ah._get_all_project_roots = lambda: [str(tmp)]
            try:
                artifacts = list_autopilot_artifacts("test-sa")
            finally:
                ah._get_all_project_roots = original
            names = [a["file"] for a in artifacts]
            self.assertIn("STATIC_ANALYSIS.md", names)
            self.assertIn("REQUIREMENTS.md", names)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
