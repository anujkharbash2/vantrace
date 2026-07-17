import sqlite3
import json
import time
import uuid
import queue
import threading
import atexit
from pathlib import Path
from dataclasses import dataclass, field

__version__ = "0.1.0"

_DB_DIR = Path.home() / ".vantrace" / "runs"
_active_run = None


def _init_db(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            step INTEGER,
            key TEXT,
            value REAL,
            timestamp REAL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS run_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    conn.commit()
    return conn


class Run:
    def __init__(self, project: str, config: dict | None = None, name: str | None = None):
        self.id = str(uuid.uuid4())[:8]
        self.project = project
        self.name = name
        self.config = config or {}
        self._step = 0
        self._start_time = time.time()

        label = self.name if self.name else "run"
        db_path = _DB_DIR / project / f"{label}-{self.id}.db"
        self._conn = _init_db(db_path)
        self._conn.execute(
            "INSERT INTO run_meta VALUES (?, ?)", ("config", json.dumps(self.config))
        )
        self._conn.execute(
            "INSERT INTO run_meta VALUES (?, ?)", ("started_at", str(self._start_time))
        )
        self._conn.commit()

        # async write queue so logging never blocks the training loop
        self._queue: queue.Queue = queue.Queue()
        self._stop = threading.Event()
        self._writer_thread = threading.Thread(target=self._writer_loop, daemon=True)
        self._writer_thread.start()

        print(f"[vantrace] run started: project={project} name={label} id={self.id}")
        print(f"[vantrace] local db: {db_path}")

    def _writer_loop(self):
        while not self._stop.is_set() or not self._queue.empty():
            try:
                item = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue
            step, key, value, ts = item
            self._conn.execute(
                "INSERT INTO metrics VALUES (?, ?, ?, ?)", (step, key, value, ts)
            )
            self._conn.commit()

    def log(self, metrics: dict, step: int | None = None):
        if step is None:
            step = self._step
            self._step += 1
        ts = time.time()
        for key, value in metrics.items():
            self._queue.put((step, key, float(value), ts))

    def finish(self):
        self._stop.set()
        self._writer_thread.join()
        self._conn.execute(
            "INSERT INTO run_meta VALUES (?, ?)", ("finished_at", str(time.time()))
        )
        self._conn.commit()
        self._conn.close()
        print(f"[vantrace] run finished: {self.name} ({self.id})")


def init(project: str, config: dict | None = None, name: str | None = None) -> Run:
    global _active_run
    _active_run = Run(project=project, config=config, name=name)
    atexit.register(lambda: _active_run.finish() if _active_run else None)
    return _active_run


def log(metrics: dict, step: int | None = None):
    if _active_run is None:
        raise RuntimeError("vantrace.init() must be called before vantrace.log()")
    _active_run.log(metrics, step=step)


def finish():
    global _active_run
    if _active_run is not None:
        _active_run.finish()
        _active_run = None