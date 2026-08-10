#!/usr/bin/env python3
"""Minimal file-backed runtime for zan-workflows V1.

This runtime intentionally does not implement locks, concurrent ownership, or
event sourcing. One run is stored as one atomically replaced run.json file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
SECRET_KEYS = {
    "access_token",
    "client_secret",
    "cookie",
    "id_token",
    "password",
    "private_key",
    "refresh_token",
    "secret",
    "set_cookie",
    "token",
}
INVOCATION_STATUSES = {
    "SUCCEEDED",
    "BLOCKED",
    "WAITING_USER",
    "INTERRUPTED",
}
VALIDATION_STATES = {"NOT_RUN", "PASSED", "FAILED"}
EFFECT_TRANSITIONS = {
    "PLANNED": {"EXECUTING", "ADOPTED_EXISTING_EFFECT", "BLOCKED"},
    "EXECUTING": {"APPLIED", "UNKNOWN", "BLOCKED"},
    "APPLIED": {"VERIFIED", "BLOCKED"},
    "UNKNOWN": {"VERIFIED", "BLOCKED"},
    "VERIFIED": set(),
    "ADOPTED_EXISTING_EFFECT": set(),
    "BLOCKED": set(),
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sanitize(value: Any, key: str | None = None) -> Any:
    normalized_key = key.lower().replace("-", "_") if key else None
    if normalized_key in SECRET_KEYS or (
        normalized_key
        and (
            normalized_key.endswith("_token")
            or normalized_key.endswith("_password")
            or normalized_key.endswith("_secret")
        )
    ):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {str(item_key): sanitize(item_value, str(item_key)) for item_key, item_value in value.items()}
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str) and (value == "验证通过" or value.startswith("验证不通过：")):
        return "[PRIVATE_VALIDATION_RESULT_DISCARDED]"
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def artifact(value: Any) -> dict[str, Any]:
    sanitized = sanitize(value)
    return {"value": sanitized, "hash": digest(sanitized)}


def default_state_root() -> Path:
    configured = os.environ.get("ZAN_WORKFLOWS_STATE_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.home() / ".codex" / "state" / "zan-workflows").resolve()


def run_path(state_root: Path, run_id: str) -> Path:
    if not run_id or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for character in run_id):
        raise ValueError("run_id may contain only letters, numbers, '-' and '_'")
    return state_root / "runs" / run_id / "run.json"


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            json.dump(value, temporary, ensure_ascii=False, indent=2, sort_keys=True)
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, path)
    finally:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)


def load_run(state_root: Path, run_id: str) -> tuple[Path, dict[str, Any]]:
    path = run_path(state_root, run_id)
    if not path.is_file():
        raise ValueError(f"run not found: {run_id}")
    with path.open(encoding="utf-8") as handle:
        run = json.load(handle)
    if run.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"unsupported schema_version: {run.get('schema_version')}")
    return path, run


def save_run(path: Path, run: dict[str, Any]) -> None:
    run["updated_at"] = now()
    atomic_write(path, run)


def read_json_argument(args: argparse.Namespace, name: str, required: bool = True) -> Any:
    inline_value = getattr(args, f"{name}_json", None)
    file_value = getattr(args, f"{name}_file", None)
    if inline_value is not None:
        return json.loads(inline_value)
    if file_value is not None:
        with Path(file_value).open(encoding="utf-8") as handle:
            return json.load(handle)
    if required:
        raise ValueError(f"one of --{name.replace('_', '-')}-json/--{name.replace('_', '-')}-file is required")
    return None


def add_json_argument(parser: argparse.ArgumentParser, name: str, required: bool = True) -> None:
    option = name.replace("_", "-")
    group = parser.add_mutually_exclusive_group(required=required)
    group.add_argument(f"--{option}-json", dest=f"{name}_json")
    group.add_argument(f"--{option}-file", dest=f"{name}_file")


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, sort_keys=True))


def command_init(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    request = read_json_argument(args, "request")
    run_id = args.run_id or f"run-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    path = run_path(state_root, run_id)
    if path.exists():
        raise ValueError(f"run already exists: {run_id}")
    timestamp = now()
    run = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "workflow": args.workflow,
        "workflow_version": args.workflow_version,
        "status": "PENDING",
        "current_skill": None,
        "next_action": None,
        "request": artifact(request),
        "public_report": None,
        "public_report_revision": 0,
        "invocations": [],
        "effects": [],
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    atomic_write(path, run)
    return {"run_id": run_id, "path": str(path), "status": run["status"]}


def command_begin_skill(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    path, run = load_run(state_root, args.run_id)
    if run["status"] not in {"PENDING", "RUNNING"}:
        raise ValueError("blocked, waiting, interrupted, or completed runs must be resumed or invalidated before a new invocation")
    running_invocations = [item for item in run["invocations"] if item["status"] == "RUNNING"]
    parent_invocation = None
    if args.parent_invocation_id:
        parent_invocation = find_invocation(run, args.parent_invocation_id)
        if parent_invocation["status"] != "RUNNING":
            raise ValueError("parent invocation is not RUNNING")
        if not running_invocations or running_invocations[-1]["invocation_id"] != args.parent_invocation_id:
            raise ValueError("parent invocation must be the current running invocation")
    elif running_invocations:
        raise ValueError("a root invocation is already RUNNING; nested calls require --parent-invocation-id")
    elif run["current_skill"] is not None and run["current_skill"] != args.skill:
        raise ValueError(f"next recorded skill is {run['current_skill']}, not {args.skill}")

    input_value = read_json_argument(args, "input")
    invocation_id = f"inv-{len(run['invocations']) + 1:04d}"
    attempt = 1 + sum(1 for item in run["invocations"] if item["skill"] == args.skill)
    invocation = {
        "invocation_id": invocation_id,
        "skill": args.skill,
        "skill_version": args.skill_version,
        "attempt": attempt,
        "parent_invocation_id": parent_invocation["invocation_id"] if parent_invocation else None,
        "status": "RUNNING",
        "input": artifact(input_value),
        "output": None,
        "validation": {"state": "NOT_RUN", "reason": None},
        "started_at": now(),
        "finished_at": None,
        "blocker_reason": None,
        "invalidated_at": None,
        "invalidation_reason": None,
        "returns": [],
    }
    run["invocations"].append(invocation)
    run["status"] = "RUNNING"
    run["current_skill"] = args.skill
    run["next_action"] = None
    save_run(path, run)
    return {"run_id": args.run_id, "invocation_id": invocation_id, "status": "RUNNING"}


def find_invocation(run: dict[str, Any], invocation_id: str) -> dict[str, Any]:
    for invocation in run["invocations"]:
        if invocation["invocation_id"] == invocation_id:
            return invocation
    raise ValueError(f"invocation not found: {invocation_id}")


def command_finish_skill(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    if args.status not in INVOCATION_STATUSES:
        raise ValueError(f"invalid invocation status: {args.status}")
    if args.validation_state not in VALIDATION_STATES:
        raise ValueError(f"invalid validation state: {args.validation_state}")
    path, run = load_run(state_root, args.run_id)
    invocation = find_invocation(run, args.invocation_id)
    if invocation["status"] != "RUNNING":
        raise ValueError(f"invocation is not RUNNING: {args.invocation_id}")
    if args.status == "SUCCEEDED":
        if args.validation_state != "PASSED":
            raise ValueError("SUCCEEDED requires validation-state PASSED")
        incomplete_or_blocked_effects = [
            effect
            for effect in run["effects"]
            if effect["invocation_id"] == args.invocation_id
            and effect["status"] not in {"VERIFIED", "ADOPTED_EXISTING_EFFECT"}
        ]
        if incomplete_or_blocked_effects:
            raise ValueError("cannot finish SUCCEEDED unless every external effect is verified or adopted")
        if invocation["parent_invocation_id"] is None:
            other_unfinished_invocations = [
                item
                for item in run["invocations"]
                if item["invocation_id"] != args.invocation_id
                and item["status"] not in {"SUCCEEDED", "INVALIDATED"}
            ]
            unresolved_effects = [
                effect
                for effect in run["effects"]
                if find_invocation(run, effect["invocation_id"])["status"] != "INVALIDATED"
                and effect["status"] not in {"VERIFIED", "ADOPTED_EXISTING_EFFECT"}
            ]
            if other_unfinished_invocations or unresolved_effects:
                raise ValueError("cannot complete run while an active invocation or external effect is unresolved")
    output_value = read_json_argument(args, "output", required=False)
    output_artifact = artifact(output_value) if output_value is not None else None
    finished_at = now()
    invocation["status"] = args.status
    invocation["output"] = output_artifact
    invocation["validation"] = {
        "state": args.validation_state,
        "reason": sanitize(args.reason) if args.reason else None,
    }
    invocation["finished_at"] = finished_at
    invocation["blocker_reason"] = sanitize(args.reason) if args.status != "SUCCEEDED" and args.reason else None
    invocation["returns"].append(
        {
            "status": args.status,
            "output": output_artifact,
            "validation": invocation["validation"],
            "finished_at": finished_at,
            "reason": sanitize(args.reason) if args.reason else None,
        }
    )

    if args.status == "SUCCEEDED" and invocation["parent_invocation_id"] is not None:
        if args.next_skill:
            raise ValueError("nested invocations return to their parent and cannot select a next root skill")
        parent = find_invocation(run, invocation["parent_invocation_id"])
        if parent["status"] != "RUNNING":
            raise ValueError("nested invocation cannot return to a non-running parent")
        run["status"] = "RUNNING"
        run["current_skill"] = parent["skill"]
        run["next_action"] = None
    elif args.status == "SUCCEEDED" and args.next_skill:
        run["status"] = "RUNNING"
        run["current_skill"] = args.next_skill
        run["next_action"] = sanitize(args.next_action) if args.next_action else None
    elif args.status == "SUCCEEDED":
        run["status"] = "SUCCEEDED"
        run["current_skill"] = None
        run["next_action"] = None
    else:
        run["status"] = args.status
        run["current_skill"] = invocation["skill"]
        run["next_action"] = sanitize(args.next_action or args.reason) if (args.next_action or args.reason) else None
    save_run(path, run)
    return {
        "run_id": args.run_id,
        "invocation_id": args.invocation_id,
        "status": args.status,
        "run_status": run["status"],
        "current_skill": run["current_skill"],
    }


def find_effect(run: dict[str, Any], effect_id: str) -> dict[str, Any]:
    for effect in run["effects"]:
        if effect["effect_id"] == effect_id:
            return effect
    raise ValueError(f"effect not found: {effect_id}")


def command_plan_effect(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    path, run = load_run(state_root, args.run_id)
    invocation = find_invocation(run, args.invocation_id)
    if invocation["status"] != "RUNNING":
        raise ValueError("external effects require a RUNNING invocation")
    target = artifact(read_json_argument(args, "target"))
    payload = artifact(read_json_argument(args, "payload"))
    effect_id = f"effect-{len(run['effects']) + 1:04d}"
    effect = {
        "effect_id": effect_id,
        "invocation_id": args.invocation_id,
        "operation": args.operation,
        "target": target,
        "intended_payload": payload,
        "intended_effect_hash": payload["hash"],
        "status": "PLANNED",
        "validation": {"state": "NOT_RUN", "reason": None},
        "authorization": None,
        "confirmation": None,
        "adoption_scope_hash": None,
        "executing_at": None,
        "applied_at": None,
        "verified_at": None,
        "actual": None,
        "readback": None,
        "blocker_reason": None,
        "created_at": now(),
        "updated_at": now(),
        "invalidated_at": None,
        "invalidation_reason": None,
    }
    run["effects"].append(effect)
    save_run(path, run)
    return {"run_id": args.run_id, "effect_id": effect_id, "status": "PLANNED"}


def command_mark_effect(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    path, run = load_run(state_root, args.run_id)
    effect = find_effect(run, args.effect_id)
    previous_status = effect["status"]
    allowed = EFFECT_TRANSITIONS.get(previous_status, set())
    if args.status not in allowed:
        raise ValueError(f"invalid effect transition: {effect['status']} -> {args.status}")
    owner = find_invocation(run, effect["invocation_id"])
    allowed_owner_statuses = {"RUNNING", "INTERRUPTED"} if previous_status == "UNKNOWN" else {"RUNNING"}
    if owner["status"] not in allowed_owner_statuses:
        raise ValueError("external effect transition requires its owning invocation to be active")

    actual_value = read_json_argument(args, "actual", required=False)
    readback_value = read_json_argument(args, "readback", required=False)
    confirmation_value = read_json_argument(args, "confirmation", required=False)
    authorization_value = read_json_argument(args, "authorization", required=False)
    timestamp = now()

    if previous_status == "UNKNOWN" and owner["status"] == "INTERRUPTED":
        owner["status"] = "RUNNING"
        owner["output"] = None
        owner["validation"] = {"state": "NOT_RUN", "reason": None}
        owner["finished_at"] = None
        owner["blocker_reason"] = None

    if args.validation_state is not None:
        if args.validation_state not in VALIDATION_STATES:
            raise ValueError(f"invalid validation state: {args.validation_state}")
        effect["validation"] = {
            "state": args.validation_state,
            "reason": sanitize(args.validation_reason) if args.validation_reason else None,
        }

    if args.status == "EXECUTING":
        if effect["validation"]["state"] != "PASSED":
            raise ValueError("EXECUTING requires validation-state PASSED")
        if authorization_value is None:
            raise ValueError("EXECUTING requires authorization evidence or NOT_REQUIRED policy evidence")
        effect["authorization"] = artifact(authorization_value)
        effect["executing_at"] = timestamp
    elif args.status == "APPLIED":
        if actual_value is None:
            raise ValueError("APPLIED requires --actual-json/--actual-file")
        effect["actual"] = artifact(actual_value)
        effect["applied_at"] = timestamp
    elif args.status == "VERIFIED":
        if readback_value is None:
            raise ValueError("VERIFIED requires --readback-json/--readback-file")
        effect["readback"] = artifact(readback_value)
        effect["verified_at"] = timestamp
        if previous_status == "UNKNOWN":
            run["status"] = "RUNNING"
            run["current_skill"] = owner["skill"]
            run["next_action"] = None
    elif args.status == "ADOPTED_EXISTING_EFFECT":
        if readback_value is None or confirmation_value is None:
            raise ValueError("ADOPTED_EXISTING_EFFECT requires readback and confirmation")
        if effect["validation"]["state"] != "PASSED":
            raise ValueError("ADOPTED_EXISTING_EFFECT requires validation-state PASSED")
        readback = artifact(readback_value)
        if readback["hash"] != effect["intended_effect_hash"]:
            raise ValueError("adopted readback does not match intended effect")
        effect["readback"] = readback
        confirmation = artifact(confirmation_value)
        effect["confirmation"] = confirmation
        effect["authorization"] = confirmation
        effect["adoption_scope_hash"] = digest(
            {
                "effect_id": effect["effect_id"],
                "target_hash": effect["target"]["hash"],
                "intended_effect_hash": effect["intended_effect_hash"],
                "readback_hash": readback["hash"],
                "confirmation_hash": confirmation["hash"],
            }
        )
        effect["verified_at"] = timestamp
        effect["executing_at"] = None
        effect["actual"] = None
    elif args.status == "BLOCKED":
        effect["blocker_reason"] = sanitize(args.reason) if args.reason else "external effect blocked"
        run["status"] = "BLOCKED"
        run["current_skill"] = find_invocation(run, effect["invocation_id"])["skill"]
        run["next_action"] = effect["blocker_reason"]
    elif args.status == "UNKNOWN":
        run["status"] = "INTERRUPTED"
        run["current_skill"] = find_invocation(run, effect["invocation_id"])["skill"]
        run["next_action"] = "Reconcile the unknown external effect before any new write."

    effect["status"] = args.status
    effect["updated_at"] = timestamp
    save_run(path, run)
    return {"run_id": args.run_id, "effect_id": args.effect_id, "status": args.status}


def command_show(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    _, run = load_run(state_root, args.run_id)
    return run


def command_record_report(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    path, run = load_run(state_root, args.run_id)
    report_value = read_json_argument(args, "report")
    if not isinstance(report_value, dict):
        raise ValueError("public report must be a JSON object")
    if report_value.get("run_id") != args.run_id:
        raise ValueError("public report run_id must match the persisted run")
    run["public_report_revision"] += 1
    stored_report = artifact(report_value)
    stored_report["revision"] = run["public_report_revision"]
    stored_report["recorded_at"] = now()
    run["public_report"] = stored_report
    save_run(path, run)
    return {
        "run_id": args.run_id,
        "revision": run["public_report_revision"],
        "report_hash": stored_report["hash"],
    }


def command_invalidate_suffix(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    path, run = load_run(state_root, args.run_id)
    invocation_ids = [item["invocation_id"] for item in run["invocations"]]
    if args.from_invocation_id not in invocation_ids:
        raise ValueError(f"invocation not found: {args.from_invocation_id}")
    selected = find_invocation(run, args.from_invocation_id)
    root = selected
    while root["parent_invocation_id"] is not None:
        root = find_invocation(run, root["parent_invocation_id"])
    derived_current_skill = root["skill"]
    if args.current_skill is not None and args.current_skill != derived_current_skill:
        raise ValueError(f"current skill is derived as {derived_current_skill}")
    start = invocation_ids.index(root["invocation_id"])
    suffix_invocation_ids = set(invocation_ids[start:])
    unreconciled_effects = [
        effect["effect_id"]
        for effect in run["effects"]
        if effect["invocation_id"] in suffix_invocation_ids
        and effect["status"] in {"EXECUTING", "APPLIED", "UNKNOWN"}
    ]
    if unreconciled_effects:
        raise ValueError(
            "cannot invalidate a suffix with unreconciled external effects: "
            + ", ".join(unreconciled_effects)
        )
    timestamp = now()
    invalidated = []
    for invocation in run["invocations"][start:]:
        invocation["status"] = "INVALIDATED"
        invocation["invalidated_at"] = timestamp
        invocation["invalidation_reason"] = sanitize(args.reason)
        invalidated.append(invocation["invocation_id"])
    invalidated_set = set(invalidated)
    for effect in run["effects"]:
        if effect["invocation_id"] in invalidated_set:
            effect["invalidated_at"] = timestamp
            effect["invalidation_reason"] = sanitize(args.reason)
    run["status"] = "RUNNING"
    run["current_skill"] = derived_current_skill
    run["next_action"] = sanitize(args.reason)
    save_run(path, run)
    return {
        "run_id": args.run_id,
        "invalidated_invocation_ids": invalidated,
        "current_skill": derived_current_skill,
        "status": "RUNNING",
    }


def command_resume(args: argparse.Namespace, state_root: Path) -> dict[str, Any]:
    _, run = load_run(state_root, args.run_id)
    prior_report = read_json_argument(args, "prior_report", required=False)
    if prior_report is not None:
        if run["public_report"] is None:
            raise ValueError("run has no recorded public report to match")
        if artifact(prior_report)["hash"] != run["public_report"]["hash"]:
            raise ValueError("supplied prior_report does not match the last recorded public report")
    current_invocation = next(
        (
            invocation
            for invocation in reversed(run["invocations"])
            if invocation["skill"] == run["current_skill"]
            and invocation["status"] in {"RUNNING", "BLOCKED", "WAITING_USER", "INTERRUPTED"}
        ),
        None,
    )
    pending_effects = [
        {
            "effect_id": effect["effect_id"],
            "invocation_id": effect["invocation_id"],
            "operation": effect["operation"],
            "status": effect["status"],
            "target": effect["target"],
            "intended_payload": effect["intended_payload"],
            "intended_effect_hash": effect["intended_effect_hash"],
            "actual": effect["actual"],
            "readback": effect["readback"],
        }
        for effect in run["effects"]
        if effect["invalidated_at"] is None
        and effect["status"] in {"PLANNED", "EXECUTING", "APPLIED", "UNKNOWN"}
    ]
    completed_outputs = [
        {
            "invocation_id": invocation["invocation_id"],
            "skill": invocation["skill"],
            "skill_version": invocation["skill_version"],
            "input_hash": invocation["input"]["hash"],
            "output": invocation["output"],
        }
        for invocation in run["invocations"]
        if invocation["status"] == "SUCCEEDED"
    ]
    return {
        "run_id": run["run_id"],
        "workflow": run["workflow"],
        "workflow_version": run["workflow_version"],
        "status": run["status"],
        "current_skill": run["current_skill"],
        "current_invocation": current_invocation,
        "next_action": run["next_action"],
        "pending_effects": pending_effects,
        "completed_outputs": completed_outputs,
        "public_report": run["public_report"],
        "public_report_revision": run["public_report_revision"],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-root", type=Path, default=default_state_root())
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init")
    init_parser.add_argument("--workflow", required=True)
    init_parser.add_argument("--workflow-version", required=True)
    init_parser.add_argument("--run-id")
    add_json_argument(init_parser, "request")

    begin_parser = subparsers.add_parser("begin-skill")
    begin_parser.add_argument("--run-id", required=True)
    begin_parser.add_argument("--skill", required=True)
    begin_parser.add_argument("--skill-version", default="1")
    begin_parser.add_argument("--parent-invocation-id")
    add_json_argument(begin_parser, "input")

    finish_parser = subparsers.add_parser("finish-skill")
    finish_parser.add_argument("--run-id", required=True)
    finish_parser.add_argument("--invocation-id", required=True)
    finish_parser.add_argument("--status", required=True)
    finish_parser.add_argument("--validation-state", default="NOT_RUN")
    finish_parser.add_argument("--reason")
    finish_parser.add_argument("--next-skill")
    finish_parser.add_argument("--next-action")
    add_json_argument(finish_parser, "output", required=False)

    plan_parser = subparsers.add_parser("plan-effect")
    plan_parser.add_argument("--run-id", required=True)
    plan_parser.add_argument("--invocation-id", required=True)
    plan_parser.add_argument("--operation", required=True)
    add_json_argument(plan_parser, "target")
    add_json_argument(plan_parser, "payload")

    effect_parser = subparsers.add_parser("mark-effect")
    effect_parser.add_argument("--run-id", required=True)
    effect_parser.add_argument("--effect-id", required=True)
    effect_parser.add_argument("--status", required=True)
    effect_parser.add_argument("--reason")
    effect_parser.add_argument("--validation-state")
    effect_parser.add_argument("--validation-reason")
    add_json_argument(effect_parser, "actual", required=False)
    add_json_argument(effect_parser, "readback", required=False)
    add_json_argument(effect_parser, "confirmation", required=False)
    add_json_argument(effect_parser, "authorization", required=False)

    show_parser = subparsers.add_parser("show")
    show_parser.add_argument("--run-id", required=True)

    report_parser = subparsers.add_parser("record-report")
    report_parser.add_argument("--run-id", required=True)
    add_json_argument(report_parser, "report")

    resume_parser = subparsers.add_parser("resume")
    resume_parser.add_argument("--run-id", required=True)
    add_json_argument(resume_parser, "prior_report", required=False)

    invalidate_parser = subparsers.add_parser("invalidate-suffix")
    invalidate_parser.add_argument("--run-id", required=True)
    invalidate_parser.add_argument("--from-invocation-id", required=True)
    invalidate_parser.add_argument("--current-skill")
    invalidate_parser.add_argument("--reason", required=True)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    state_root = args.state_root.expanduser().resolve()
    commands = {
        "init": command_init,
        "begin-skill": command_begin_skill,
        "finish-skill": command_finish_skill,
        "plan-effect": command_plan_effect,
        "mark-effect": command_mark_effect,
        "show": command_show,
        "record-report": command_record_report,
        "resume": command_resume,
        "invalidate-suffix": command_invalidate_suffix,
    }
    try:
        result = commands[args.command](args, state_root)
        print_json(result)
        return 0
    except (ValueError, json.JSONDecodeError, OSError) as error:
        print_json({"error": str(error)})
        return 2


if __name__ == "__main__":
    sys.exit(main())
