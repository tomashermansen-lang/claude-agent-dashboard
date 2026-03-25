"""Unit tests for plan_helpers.py extensions.

Tests find_plans, find_task, _match_task_to_dir, evaluate_gate,
and enhanced merge_file_status with R6a matching.
"""
import json
import sys
from pathlib import Path

import pytest

# Add project root to path so we can import server.plan_helpers
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.plan_helpers import (
    _load_plan_file,
    _match_task_to_dir,
    evaluate_gate,
    find_plans,
    find_task,
    merge_file_status,
)


# ─── Fixtures ─────────────────────────────────────────────────────────


def _make_plan(phases):
    """Create a minimal valid plan dict."""
    return {"schema_version": "1.0.0", "name": "Test Plan", "phases": phases}


def _make_phase(phase_id, tasks, gate=None):
    """Create a phase dict."""
    phase = {"id": phase_id, "name": f"Phase: {phase_id}", "tasks": tasks}
    if gate:
        phase["gate"] = gate
    return phase


def _make_task(task_id, status="pending", depends=None):
    """Create a task dict."""
    task = {"id": task_id, "name": f"Task {task_id}", "status": status}
    if depends:
        task["depends"] = depends
    return task


def _write_yaml_plan(path, plan_dict):
    """Write a plan as YAML (or JSON if PyYAML unavailable)."""
    try:
        import yaml

        path.write_text(yaml.dump(plan_dict, default_flow_style=False))
    except ImportError:
        # Fall back to JSON with .yaml extension — find_plans handles this
        path.write_text(json.dumps(plan_dict))


# ─── _match_task_to_dir tests ─────────────────────────────────────────


class TestMatchTaskToDir:
    def test_exact_match(self):
        result, tier = _match_task_to_dir("vector-store", ["vector-store", "ui-search"])
        assert result == "vector-store"
        assert tier == "exact"

    def test_normalized_hyphens_underscores(self):
        result, tier = _match_task_to_dir("vector_store", ["vector-store", "ui-search"])
        assert result == "vector-store"
        assert tier == "normalized"

    def test_normalized_case_insensitive(self):
        result, tier = _match_task_to_dir("Vector-Store", ["vector-store", "ui-search"])
        assert result == "vector-store"
        assert tier == "normalized"

    def test_fuzzy_needle_substring_of_candidate(self):
        # "dark-mode" (9 chars) is substring of "dark-mode-ui" (12 chars) → 75% coverage
        result, tier = _match_task_to_dir("dark-mode", ["dark-mode-ui"])
        assert result == "dark-mode-ui"
        assert tier == "fuzzy"

    def test_fuzzy_candidate_substring_of_needle(self):
        # "auth-module" (11 chars) is substring of "api-auth-module" (15 chars) → 73% coverage
        result, tier = _match_task_to_dir("api-auth-module", ["auth-module"])
        assert result == "auth-module"
        assert tier == "fuzzy"

    def test_fuzzy_rejects_short_substring(self):
        # "capacity" (8 chars) in "absence-aware-capacity" (22 chars) → 36% coverage → NO match
        result, tier = _match_task_to_dir("absence-aware-capacity", ["capacity"])
        assert result is None
        assert tier == "none"

    def test_fuzzy_rejects_very_short_candidate(self):
        # "api" (3 chars) in "authentication-api" (18 chars) → 17% coverage → NO match
        result, tier = _match_task_to_dir("authentication-api", ["api"])
        assert result is None
        assert tier == "none"

    def test_fuzzy_rejects_dashboard_vs_eval_dashboard(self):
        # "dashboard" (9 chars) in "eval-dashboard" (14 chars) → 64% coverage → NO match
        result, tier = _match_task_to_dir("eval-dashboard", ["dashboard"])
        assert result is None
        assert tier == "none"

    def test_no_match(self):
        result, tier = _match_task_to_dir("vector-store", ["ui-search", "api-auth"])
        assert result is None
        assert tier == "none"

    def test_empty_candidates(self):
        result, tier = _match_task_to_dir("anything", [])
        assert result is None
        assert tier == "none"


# ─── find_plans tests ─────────────────────────────────────────────────


class TestFindPlans:
    def test_find_plans_inprogress(self, tmp_path):
        plan_dir = tmp_path / "docs" / "INPROGRESS_Plan_my-feature"
        plan_dir.mkdir(parents=True)
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        _write_yaml_plan(plan_dir / "execution-plan.yaml", plan)

        results = find_plans(str(tmp_path))
        assert len(results) == 1
        assert results[0]["name"] == "my-feature"
        assert results[0]["lifecycle"] == "inprogress"
        assert results[0]["type"] == "plan"

    def test_find_plans_done(self, tmp_path):
        plan_dir = tmp_path / "docs" / "DONE_Plan_old-feature"
        plan_dir.mkdir(parents=True)
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        _write_yaml_plan(plan_dir / "execution-plan.yaml", plan)

        results = find_plans(str(tmp_path))
        assert len(results) == 1
        assert results[0]["name"] == "old-feature"
        assert results[0]["lifecycle"] == "done"
        assert results[0]["type"] == "plan"

    def test_find_plans_inprogress_feature(self, tmp_path):
        plan_dir = tmp_path / "docs" / "INPROGRESS_Feature_my-feat"
        plan_dir.mkdir(parents=True)
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        _write_yaml_plan(plan_dir / "execution-plan.yaml", plan)

        results = find_plans(str(tmp_path))
        assert len(results) == 1
        assert results[0]["name"] == "my-feat"
        assert results[0]["lifecycle"] == "inprogress"
        assert results[0]["type"] == "feature"

    def test_find_plans_pending_feature(self, tmp_path):
        plan_dir = tmp_path / "docs" / "PENDING_Feature_backlog-item"
        plan_dir.mkdir(parents=True)
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        _write_yaml_plan(plan_dir / "execution-plan.yaml", plan)

        results = find_plans(str(tmp_path))
        assert len(results) == 1
        assert results[0]["name"] == "backlog-item"
        assert results[0]["lifecycle"] == "pending"
        assert results[0]["type"] == "feature"

    def test_find_plans_root_yaml_fallback(self, tmp_path):
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        _write_yaml_plan(tmp_path / "execution-plan.yaml", plan)

        results = find_plans(str(tmp_path))
        assert len(results) == 1
        assert results[0]["lifecycle"] == "root"

    def test_find_plans_root_json_fallback(self, tmp_path):
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        (tmp_path / "execution-plan.json").write_text(json.dumps(plan))

        results = find_plans(str(tmp_path))
        assert len(results) == 1
        assert results[0]["lifecycle"] == "root"

    def test_find_plans_no_docs_dir(self, tmp_path):
        results = find_plans(str(tmp_path))
        assert results == []

    def test_find_plans_multiple(self, tmp_path):
        for name, prefix in [("feat-a", "INPROGRESS_Plan_"), ("feat-b", "DONE_Plan_")]:
            plan_dir = tmp_path / "docs" / f"{prefix}{name}"
            plan_dir.mkdir(parents=True)
            plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
            _write_yaml_plan(plan_dir / "execution-plan.yaml", plan)

        results = find_plans(str(tmp_path))
        assert len(results) == 2
        names = {r["name"] for r in results}
        assert names == {"feat-a", "feat-b"}

    def test_find_plans_malformed_yaml(self, tmp_path):
        plan_dir = tmp_path / "docs" / "INPROGRESS_Plan_bad"
        plan_dir.mkdir(parents=True)
        (plan_dir / "execution-plan.yaml").write_text("{{invalid yaml:::")

        good_dir = tmp_path / "docs" / "INPROGRESS_Plan_good"
        good_dir.mkdir(parents=True)
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        _write_yaml_plan(good_dir / "execution-plan.yaml", plan)

        results = find_plans(str(tmp_path))
        assert len(results) == 1
        assert results[0]["name"] == "good"


# ─── find_task tests ──────────────────────────────────────────────────


class TestFindTask:
    def test_exact_match(self):
        plan = _make_plan([
            _make_phase("p1", [_make_task("vector-store"), _make_task("ui-search")])
        ])
        task = find_task(plan, "vector-store")
        assert task is not None
        assert task["id"] == "vector-store"

    def test_normalized_match(self):
        plan = _make_plan([
            _make_phase("p1", [_make_task("vector-store")])
        ])
        task = find_task(plan, "vector_store")
        assert task is not None
        assert task["id"] == "vector-store"

    def test_fuzzy_match(self):
        plan = _make_plan([
            _make_phase("p1", [_make_task("dark-mode-ui")])
        ])
        task = find_task(plan, "dark-mode")
        assert task is not None
        assert task["id"] == "dark-mode-ui"

    def test_no_match(self):
        plan = _make_plan([
            _make_phase("p1", [_make_task("vector-store")])
        ])
        task = find_task(plan, "nonexistent")
        assert task is None

    def test_searches_all_phases(self):
        plan = _make_plan([
            _make_phase("p1", [_make_task("task-a")]),
            _make_phase("p2", [_make_task("task-b")]),
        ])
        task = find_task(plan, "task-b")
        assert task is not None
        assert task["id"] == "task-b"


# ─── evaluate_gate tests ─────────────────────────────────────────────


class TestEvaluateGate:
    def test_all_done(self):
        plan = _make_plan([
            _make_phase("p1", [
                _make_task("t1", status="done"),
                _make_task("t2", status="done"),
            ])
        ])
        result = evaluate_gate(plan, "p1")
        assert result["phase_id"] == "p1"
        assert result["all_complete"] is True
        assert result["gate_passed"] is True

    def test_partial(self):
        plan = _make_plan([
            _make_phase("p1", [
                _make_task("t1", status="done"),
                _make_task("t2", status="pending"),
            ])
        ])
        result = evaluate_gate(plan, "p1")
        assert result["all_complete"] is False
        assert result["gate_passed"] is False

    def test_with_skipped(self):
        plan = _make_plan([
            _make_phase("p1", [
                _make_task("t1", status="done"),
                _make_task("t2", status="skipped"),
            ])
        ])
        result = evaluate_gate(plan, "p1")
        assert result["all_complete"] is True
        assert result["gate_passed"] is True

    def test_unknown_phase(self):
        plan = _make_plan([
            _make_phase("p1", [_make_task("t1", status="done")])
        ])
        result = evaluate_gate(plan, "nonexistent")
        assert result["all_complete"] is False
        assert result["gate_passed"] is False


# ─── merge_file_status R6a matching tests ─────────────────────────────


class TestMergeFileStatusR6a:
    def test_normalized_match(self, tmp_path):
        """task-a matches DONE_Feature_task_a/ via normalized matching."""
        docs = tmp_path / "docs"
        (docs / "DONE_Feature_task_a").mkdir(parents=True)
        plan = _make_plan([
            _make_phase("p1", [_make_task("task-a", status="pending")])
        ])
        result = merge_file_status(plan, str(tmp_path))
        assert result["phases"][0]["tasks"][0]["status"] == "done"

    def test_fuzzy_match(self, tmp_path):
        """dark-mode matches INPROGRESS_Feature_dark-mode-ui/ via fuzzy (75% coverage)."""
        docs = tmp_path / "docs"
        (docs / "INPROGRESS_Feature_dark-mode-ui").mkdir(parents=True)
        plan = _make_plan([
            _make_phase("p1", [_make_task("dark-mode", status="pending")])
        ])
        result = merge_file_status(plan, str(tmp_path))
        assert result["phases"][0]["tasks"][0]["status"] == "wip"

    def test_fuzzy_rejects_short_match(self, tmp_path):
        """capacity should NOT match absence-aware-capacity (36% coverage)."""
        docs = tmp_path / "docs"
        (docs / "DONE_Feature_capacity").mkdir(parents=True)
        plan = _make_plan([
            _make_phase("p1", [_make_task("absence-aware-capacity", status="pending")])
        ])
        result = merge_file_status(plan, str(tmp_path))
        assert result["phases"][0]["tasks"][0]["status"] == "pending"

    def test_exact_preserved(self, tmp_path):
        """Existing exact match behavior is preserved (regression test)."""
        docs = tmp_path / "docs"
        (docs / "DONE_Feature_task-a").mkdir(parents=True)
        plan = _make_plan([
            _make_phase("p1", [_make_task("task-a", status="pending")])
        ])
        result = merge_file_status(plan, str(tmp_path))
        assert result["phases"][0]["tasks"][0]["status"] == "done"


# ─── _load_plan_file tests ───────────────────────────────────────────


class TestLoadPlanFile:
    def test_load_yaml(self, tmp_path):
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        plan_path = tmp_path / "execution-plan.yaml"
        _write_yaml_plan(plan_path, plan)
        result = _load_plan_file(plan_path)
        assert result is not None
        assert result["name"] == "Test Plan"

    def test_load_json(self, tmp_path):
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        plan_path = tmp_path / "execution-plan.json"
        plan_path.write_text(json.dumps(plan))
        result = _load_plan_file(plan_path)
        assert result is not None
        assert result["name"] == "Test Plan"

    def test_malformed_returns_none(self, tmp_path):
        plan_path = tmp_path / "execution-plan.json"
        plan_path.write_text("{{not valid json")
        result = _load_plan_file(plan_path)
        assert result is None

    def test_yaml_with_json_content(self, tmp_path):
        """A .yaml file containing valid JSON should still load."""
        plan = _make_plan([_make_phase("p1", [_make_task("t1")])])
        plan_path = tmp_path / "execution-plan.yaml"
        plan_path.write_text(json.dumps(plan))
        result = _load_plan_file(plan_path)
        assert result is not None
        assert result["name"] == "Test Plan"


# ─── evaluate_gate edge case tests ───────────────────────────────────


class TestEvaluateGateEdge:
    def test_empty_tasks(self):
        """Phase with no tasks should not pass gate."""
        plan = _make_plan([_make_phase("p1", [])])
        result = evaluate_gate(plan, "p1")
        assert result["all_complete"] is False
        assert result["gate_passed"] is False
