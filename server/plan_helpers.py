"""Plan loading, status merging, and project discovery helpers.

Encapsulates all execution-plan logic so serve.py stays focused on routing.
Functions: load_execution_plan, merge_file_status, find_plans, find_task,
_match_task_to_dir, _normalize_id, evaluate_gate, discover_all_plans_v2.
"""
import json
import copy
import logging
import os
import re
from pathlib import Path

# Configurable project root — override via PROJECTS_ROOT env var
PROJECTS_ROOT = Path(os.environ.get("PROJECTS_ROOT", str(Path.home() / "Projekter")))

logger = logging.getLogger(__name__)

PLAN_FILENAMES = ["execution-plan.yaml", "execution-plan.json"]


def _normalize_id(s: str) -> str:
    """Normalize a task/directory ID: lowercase, hyphens and underscores equivalent."""
    return s.lower().replace("_", "-")


def load_execution_plan(main_worktree: str) -> dict | None:
    """Load an execution plan from a worktree root.

    Looks for execution-plan.yaml, execution-plan.json at root.
    Falls back to EXECUTION_GUIDE.md with auto-conversion.
    Returns structured dict or None.
    """
    root = Path(main_worktree)
    if not root.is_dir():
        return None

    for filename in PLAN_FILENAMES:
        plan_path = root / filename
        if plan_path.is_file():
            plan = _load_plan_file(plan_path)
            if plan:
                return plan

    guide_path = root / "EXECUTION_GUIDE.md"
    if guide_path.is_file():
        try:
            import sys
            tools_dir = str(Path(__file__).resolve().parent.parent / "tools")
            if tools_dir not in sys.path:
                sys.path.insert(0, tools_dir)
            from convert_guide import parse_guide, emit_plan
            text = guide_path.read_text(encoding="utf-8")
            parsed = parse_guide(text)
            return emit_plan(parsed)
        except Exception:
            return None

    return None


def _match_task_to_dir(needle: str, candidates: list[str]) -> tuple[str | None, str]:
    """Match a task ID against a list of directory names using 4-tier matching.

    Tiers: exact → normalized → fuzzy → none.
    Returns (matched_candidate, match_tier).
    """
    if not candidates:
        return None, "none"

    # Tier 1: exact match
    for c in candidates:
        if needle == c:
            return c, "exact"

    # Tier 2: normalized (lowercase, hyphens/underscores equivalent)
    needle_norm = _normalize_id(needle)
    for c in candidates:
        if needle_norm == _normalize_id(c):
            return c, "normalized"

    # Tier 3: fuzzy (substring in either direction, but only if the shorter
    # string covers ≥60% of the longer string — prevents "capacity" matching
    # "absence-aware-capacity")
    for c in candidates:
        c_norm = _normalize_id(c)
        longer = max(len(needle_norm), len(c_norm))
        shorter = min(len(needle_norm), len(c_norm))
        if longer > 0 and shorter / longer >= 0.7:
            if needle_norm in c_norm or c_norm in needle_norm:
                return c, "fuzzy"

    return None, "none"


def merge_file_status(plan: dict, main_worktree: str) -> dict:
    """Override task statuses based on filesystem markers.

    For each task, checks docs/ directories using R6a 4-tier matching
    (exact → normalized → fuzzy → none).
    File-based detection wins over YAML status.
    Returns a new dict (does NOT mutate input).
    """
    result = copy.deepcopy(plan)
    docs_dir = Path(main_worktree) / "docs"

    if not docs_dir.is_dir():
        return result

    # Build lists of DONE_ and INPROGRESS_ directory names (stripped of prefix)
    # Convention: docs/{STATUS}_{Type}_{name}/ where Type is Feature or Plan
    done_dirs = []
    inprogress_dirs = []
    try:
        for entry in docs_dir.iterdir():
            if not entry.is_dir():
                continue
            name = entry.name
            if name.startswith("DONE_Feature_"):
                done_dirs.append(name[13:])
            elif name.startswith("DONE_Plan_"):
                done_dirs.append(name[10:])
            elif name.startswith("INPROGRESS_Feature_"):
                inprogress_dirs.append(name[19:])
            elif name.startswith("INPROGRESS_Plan_"):
                inprogress_dirs.append(name[16:])
    except Exception as e:
        logger.error("merge_file_status: failed to read docs dir path=%s exc=%s", docs_dir, e)
        return result

    for phase in result.get("phases", []):
        for task in phase.get("tasks", []):
            tid = task.get("id", "")
            if not tid:
                continue

            matched, tier = _match_task_to_dir(tid, done_dirs)
            if matched:
                if tier == "fuzzy":
                    logger.warning(
                        "Fuzzy match: task '%s' matched directory 'DONE_*_%s'. "
                        "Verify this mapping is correct.", tid, matched
                    )
                task["status"] = "done"
                continue

            matched, tier = _match_task_to_dir(tid, inprogress_dirs)
            if matched:
                if tier == "fuzzy":
                    logger.warning(
                        "Fuzzy match: task '%s' matched directory 'INPROGRESS_*_%s'. "
                        "Verify this mapping is correct.", tid, matched
                    )
                task["status"] = "wip"

    return result


def find_plans(main_worktree: str) -> list[dict]:
    """Discover all execution plans in a worktree root.

    Scans docs/{STATUS}_{Type}_{name}/ directories for execution-plan.yaml,
    where STATUS is PENDING, INPROGRESS, or DONE and Type is Feature or Plan.
    Falls back to root-level execution-plan.yaml/json.
    Returns [{"name": str, "path": str, "lifecycle": str, "type": str, "plan": dict}].
    Does NOT apply merge_file_status — caller is responsible.
    """
    root = Path(main_worktree)
    if not root.is_dir():
        return []

    results = []
    docs_dir = root / "docs"

    if docs_dir.is_dir():
        try:
            for entry in sorted(docs_dir.iterdir()):
                if not entry.is_dir():
                    continue
                name = entry.name
                if name.startswith("INPROGRESS_Plan_"):
                    feature = name[16:]
                    lifecycle = "inprogress"
                    entry_type = "plan"
                elif name.startswith("DONE_Plan_"):
                    feature = name[10:]
                    lifecycle = "done"
                    entry_type = "plan"
                elif name.startswith("INPROGRESS_Feature_"):
                    feature = name[19:]
                    lifecycle = "inprogress"
                    entry_type = "feature"
                elif name.startswith("DONE_Feature_"):
                    feature = name[13:]
                    lifecycle = "done"
                    entry_type = "feature"
                elif name.startswith("PENDING_Feature_"):
                    feature = name[16:]
                    lifecycle = "pending"
                    entry_type = "feature"
                elif name.startswith("PENDING_Plan_"):
                    feature = name[13:]
                    lifecycle = "pending"
                    entry_type = "plan"
                else:
                    continue

                plan_path = entry / "execution-plan.yaml"
                if plan_path.is_file():
                    plan = _load_plan_file(plan_path)
                    if plan:
                        results.append({
                            "name": feature,
                            "path": str(plan_path),
                            "lifecycle": lifecycle,
                            "type": entry_type,
                            "plan": plan,
                        })
        except Exception as e:
            logger.error("find_plans: failed to scan docs dir path=%s exc=%s", docs_dir, e)

    # Root-level fallback (backward compat)
    if not results:
        for filename in PLAN_FILENAMES:
            plan_path = root / filename
            if plan_path.is_file():
                plan = _load_plan_file(plan_path)
                if plan:
                    results.append({
                        "name": plan.get("name", root.name),
                        "path": str(plan_path),
                        "lifecycle": "root",
                        "plan": plan,
                    })
                    break

    return results


def _load_plan_file(plan_path: Path) -> dict | None:
    """Load a single plan file (YAML or JSON). Returns dict or None.

    Single source of truth for plan file loading. Used by both
    load_execution_plan() and find_plans(). Does NOT apply
    merge_file_status — caller is responsible.
    """
    try:
        if plan_path.suffix in (".yaml", ".yml"):
            try:
                import yaml
                with open(plan_path) as f:
                    return yaml.safe_load(f)
            except ImportError:
                # Try loading as JSON (some .yaml files may actually be JSON)
                try:
                    with open(plan_path) as f:
                        return json.load(f)
                except Exception:
                    return None
        else:
            with open(plan_path) as f:
                return json.load(f)
    except Exception:
        return None


def find_task(plan: dict, feature_name: str) -> dict | None:
    """Locate a task by feature name using R6a 4-tier matching.

    Searches all phases. Returns the task dict or None.
    """
    all_task_ids = []
    task_map = {}
    for phase in plan.get("phases", []):
        for task in phase.get("tasks", []):
            tid = task.get("id", "")
            if tid:
                all_task_ids.append(tid)
                task_map[tid] = task

    matched, tier = _match_task_to_dir(feature_name, all_task_ids)
    if matched:
        if tier == "fuzzy":
            logger.warning(
                "Fuzzy match: feature '%s' matched task '%s'. "
                "Verify this mapping is correct.", feature_name, matched
            )
        return task_map[matched]

    return None


def evaluate_gate(plan: dict, phase_id: str) -> dict:
    """Read-only gate check for dashboard display.

    Returns {"phase_id": str, "all_complete": bool, "gate_passed": bool}.
    Gate passes when all tasks in the phase are done or skipped.
    """
    for phase in plan.get("phases", []):
        if phase.get("id") == phase_id:
            tasks = phase.get("tasks", [])
            if not tasks:
                return {"phase_id": phase_id, "all_complete": False, "gate_passed": False}
            complete_statuses = {"done", "skipped"}
            all_complete = all(
                t.get("status") in complete_statuses for t in tasks
            )
            return {
                "phase_id": phase_id,
                "all_complete": all_complete,
                "gate_passed": all_complete,
            }

    return {"phase_id": phase_id, "all_complete": False, "gate_passed": False}


def _infer_main_worktree(path: str) -> str | None:
    """Infer the main worktree from a (possibly deleted) worktree path.

    Claude Code worktrees live at <repo>/.claude/worktrees/<name>.
    If path matches this pattern and the repo root exists, return it.
    """
    marker = "/.claude/worktrees/"
    idx = path.find(marker)
    if idx >= 0:
        candidate = path[:idx]
        if Path(candidate).is_dir():
            return candidate
    return None


def _load_root_cache() -> set[str]:
    """Load cached project roots so deleted worktrees don't orphan plans."""
    cache = Path(__file__).resolve().parent.parent / "data" / ".plan_roots_cache"
    if cache.is_file():
        try:
            return set(cache.read_text(encoding="utf-8").strip().splitlines())
        except Exception:
            return set()
    return set()


def _save_root_cache(roots: set[str]) -> None:
    """Persist discovered project roots."""
    cache = Path(__file__).resolve().parent.parent / "data" / ".plan_roots_cache"
    try:
        cache.write_text("\n".join(sorted(roots)) + "\n", encoding="utf-8")
    except Exception as e:
        logger.warning("_save_root_cache: failed to write cache path=%s exc=%s", cache, e)


def _resolve_repo_roots() -> set[str]:
    """Resolve unique repo roots from sessions.jsonl CWDs.

    Reads data/sessions.jsonl, resolves each CWD to its main worktree root
    via git, with fallback to path inference and parent scanning.
    Merges with cached roots so deleted worktrees remain discoverable.
    Returns set of validated root paths.
    """
    data_dir = Path(__file__).resolve().parent.parent / "data"
    jsonl_path = data_dir / "sessions.jsonl"

    if not jsonl_path.is_file():
        return set()

    cwds = set()
    try:
        lines = jsonl_path.read_text(encoding="utf-8").strip().splitlines()
        for line in lines[-1000:]:
            try:
                entry = json.loads(line)
                cwd = entry.get("cwd", "")
                if cwd:
                    cwds.add(cwd)
            except json.JSONDecodeError:
                continue
    except Exception:
        return set()

    import subprocess
    seen_roots = set()

    for cwd in cwds:
        try:
            proc = subprocess.run(
                ["git", "-C", cwd, "worktree", "list", "--porcelain"],
                capture_output=True, text=True, timeout=5,
            )
            if proc.returncode != 0:
                raise RuntimeError("git failed")
            for ln in proc.stdout.splitlines():
                if ln.startswith("worktree "):
                    root = ln[len("worktree "):]
                    if root not in seen_roots:
                        seen_roots.add(root)
                    break
        except Exception:
            inferred = _infer_main_worktree(cwd)
            if inferred and inferred not in seen_roots:
                seen_roots.add(inferred)
                continue
            parent = Path(cwd).parent
            if parent.is_dir():
                try:
                    children = list(parent.iterdir())
                    if len(children) <= 100:
                        for child in children:
                            if not child.is_dir() or child.name.startswith('.'):
                                continue
                            for fn in PLAN_FILENAMES:
                                if (child / fn).is_file():
                                    seen_roots.add(str(child))
                                    break
                except Exception:
                    pass

    # Merge with cached roots (survives worktree deletion)
    cached_roots = _load_root_cache()
    for root in cached_roots:
        if root not in seen_roots and Path(root).is_dir():
            seen_roots.add(root)
    valid_roots = {r for r in seen_roots if Path(r).is_dir()}

    # Deduplicate: collapse worktrees to their main repo root
    deduped = set()
    for root in valid_roots:
        try:
            proc = subprocess.run(
                ["git", "-C", root, "worktree", "list", "--porcelain"],
                capture_output=True, text=True, timeout=5,
            )
            if proc.returncode == 0:
                for ln in proc.stdout.splitlines():
                    if ln.startswith("worktree "):
                        deduped.add(ln[len("worktree "):])
                        break
            else:
                deduped.add(root)
        except Exception:
            deduped.add(root)

    _save_root_cache(deduped)
    return deduped


def discover_all_plans_v2() -> list[dict]:
    """Discover all projects with execution plans, enriched with lifecycle.

    Resolves repo roots from sessions.jsonl, then calls find_plans()
    for docs-directory scanning.
    Returns [{project, path, plan_dir, lifecycle, phases, progress, has_plan}].
    """
    seen_roots = _resolve_repo_roots()
    results = []
    for root in seen_roots:
        plans = find_plans(root)
        if plans:
            for entry in plans:
                plan = entry["plan"]
                plan = merge_file_status(plan, root)
                phases = plan.get("phases", [])
                total = sum(len(p.get("tasks", [])) for p in phases)
                done_count = sum(
                    1
                    for p in phases
                    for t in p.get("tasks", [])
                    if t.get("status") == "done"
                )
                progress = round((done_count / total) * 100) if total > 0 else 0
                results.append({
                    "project": plan.get("name", entry["name"]),
                    "path": root,
                    "plan_dir": str(Path(entry["path"]).parent),
                    "lifecycle": entry["lifecycle"],
                    "phases": len(phases),
                    "progress": progress,
                    "has_plan": True,
                })
        else:
            # Fall back to root-level plan via load_execution_plan
            plan = load_execution_plan(root)
            if not plan:
                continue
            plan = merge_file_status(plan, root)
            phases = plan.get("phases", [])
            total = sum(len(p.get("tasks", [])) for p in phases)
            done_count = sum(
                1
                for p in phases
                for t in p.get("tasks", [])
                if t.get("status") == "done"
            )
            progress = round((done_count / total) * 100) if total > 0 else 0
            results.append({
                "project": plan.get("name", Path(root).name),
                "path": root,
                "plan_dir": root,
                "lifecycle": "root",
                "phases": len(phases),
                "progress": progress,
                "has_plan": True,
            })

    return results


# ── Plan Artifact Helpers ─────────────────────────────────────────────

_TASK_NAME_RE = re.compile(r'^[a-zA-Z0-9_-]+$')

_TASK_ARTIFACT_FILES = {
    "REQUIREMENTS.md", "PLAN.md", "DESIGN.md", "TEAM_REVIEW.md",
    "TEAM_QA.md", "QA_REPORT.md", "TESTPLAN.md", "MANUAL_TEST_LOG.md",
}

_PLAN_ARTIFACT_FILES = {
    "execution-plan.yaml", "SETUP_PLAN.md", "EXECUTION_GUIDE.md",
    "EXECUTION_PLAN.md", "DEFERRED.md",
}

_ALL_ALLOWED_FILES = _TASK_ARTIFACT_FILES | _PLAN_ARTIFACT_FILES


def list_task_artifacts(cwd: str, task: str) -> list[dict]:
    """List available doc artifacts for a task in a project.

    Searches docs/{DONE,INPROGRESS}_Feature_<task>/ for known filenames.
    Returns list of {"name": str, "file": str} dicts.
    """
    if not _TASK_NAME_RE.match(task):
        return []
    project = Path(cwd)
    results = []
    for prefix in ("DONE_Feature_", "INPROGRESS_Feature_"):
        feature_dir = project / "docs" / f"{prefix}{task}"
        if not feature_dir.is_dir():
            continue
        for filename in sorted(_TASK_ARTIFACT_FILES):
            if (feature_dir / filename).is_file():
                results.append({"name": filename, "file": filename})
        if results:
            break  # prefer DONE_ over INPROGRESS_ but don't duplicate
    return results


def get_plan_artifact(cwd: str | None, plan_dir: str | None,
                      task: str | None, filename: str) -> str | None:
    """Read a plan or task artifact file, returning content or None.

    For task artifacts: cwd + task → docs/{DONE,INPROGRESS}_Feature_<task>/<file>
    For plan artifacts: plan_dir → <plan_dir>/<file>
    Validates path stays under ~/Projekter/ or the project root (for tests).
    """
    if filename not in _ALL_ALLOWED_FILES:
        return None

    candidate = None
    if task and cwd and _TASK_NAME_RE.match(task):
        project = Path(cwd)
        for prefix in ("DONE_Feature_", "INPROGRESS_Feature_"):
            path = project / "docs" / f"{prefix}{task}" / filename
            if path.is_file():
                candidate = path
                break
    elif plan_dir:
        path = Path(plan_dir) / filename
        if path.is_file():
            candidate = path

    if candidate is None:
        return None

    # Security: resolve symlinks and validate path
    resolved = candidate.resolve()
    home_projekter = str(PROJECTS_ROOT) + "/"
    project_root = str(Path(__file__).resolve().parent.parent) + "/"
    if not (str(resolved).startswith(home_projekter) or
            str(resolved).startswith(project_root)):
        return None

    try:
        return resolved.read_text(encoding="utf-8")
    except (OSError, IOError):
        return None
