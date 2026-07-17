import sys
import sqlite3
import json
from pathlib import Path

_DB_DIR = Path.home() / ".vantrace" / "runs"


def _find_dbs():
    if not _DB_DIR.exists():
        return []
    return sorted(_DB_DIR.glob("*/*.db"))


def list_runs():
    dbs = _find_dbs()
    if not dbs:
        print("No runs found. Log a run with vantrace.init() first.")
        return

    print(f"{'PROJECT':<20} {'RUN':<20} {'STEPS':<8} {'STATUS'}")
    print("-" * 65)
    for db_path in dbs:
        project = db_path.parent.name
        run_label = db_path.stem
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT MAX(step) FROM metrics")
        max_step = cur.fetchone()[0]
        steps = (max_step + 1) if max_step is not None else 0
        cur.execute("SELECT value FROM run_meta WHERE key = 'finished_at'")
        status = "finished" if cur.fetchone() else "incomplete"
        conn.close()
        print(f"{project:<20} {run_label:<20} {steps:<8} {status}")


def show_run(run_id: str):
    dbs = _find_dbs()
    matches = [d for d in dbs if run_id in d.stem]

    # fallback: treat run_id as a project name, show latest run in it
    if not matches:
        project_matches = [d for d in dbs if d.parent.name == run_id]
        if project_matches:
            matches = [max(project_matches, key=lambda p: p.stat().st_mtime)]

    if not matches:
        print(f"No run or project found matching '{run_id}'")
        return
    if len(matches) > 1:
        print(f"Multiple runs match '{run_id}':")
        for m in matches:
            print(f"  {m.stem}")
        return

    db_path = matches[0]
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    print(f"Run: {db_path.stem}")
    print(f"Project: {db_path.parent.name}")
    print(f"DB: {db_path}\n")

    cur.execute("SELECT key, value FROM run_meta")
    print("Config / meta:")
    for key, value in cur.fetchall():
        if key == "config":
            print(f"  config: {json.loads(value)}")
        else:
            print(f"  {key}: {value}")

    print("\nMetrics (last 10 steps):")
    cur.execute("SELECT step, key, value FROM metrics ORDER BY step DESC LIMIT 10")
    rows = cur.fetchall()
    for step, key, value in reversed(rows):
        print(f"  step {step}: {key} = {value:.4f}")

    conn.close()


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("list", "show"):
        print("Usage:")
        print("  vantrace list             List all runs")
        print("  vantrace show <run_id>    Show details for a run")
        sys.exit(1)

    if sys.argv[1] == "list":
        list_runs()
    elif sys.argv[1] == "show":
        if len(sys.argv) < 3:
            print("Usage: vantrace show <run_id>")
            sys.exit(1)
        show_run(sys.argv[2])


if __name__ == "__main__":
    main()