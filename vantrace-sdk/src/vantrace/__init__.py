import sqlite3
import json
import time
import uuid
import queue
import threading
import atexit
import shutil
from pathlib import Path

import requests

__version__ = "0.2.0"

_DB_DIR = Path.home() / ".vantrace" / "runs"
_SERVER_URL = "http://localhost:6789"
_active_run = None


def _server_available() -> bool:
    try:
        r = requests.get(f"{_SERVER_URL}/health", timeout=0.3)
        return r.status_code == 200
    except requests.RequestException:
        return False


def _init_local_db(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            step INTEGER, key TEXT, value REAL, timestamp REAL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS run_meta (key TEXT PRIMARY KEY, value TEXT)
    """)
    conn.commit()
    return conn


class Run:
    def __init__(self, project: str, config: dict | None = None, name: str | None = None):
        self.project = project
        self.config = config or {}
        self.name = name
        self._step = 0
        self._use_server = _server_available()

        self._queue: queue.Queue = queue.Queue()
        self._stop = threading.Event()

        if self._use_server:
            self._init_server_run()
        else:
            self._init_local_run()

        self._writer_thread = threading.Thread(target=self._writer_loop, daemon=True)
        self._writer_thread.start()

    def _init_server_run(self):
        resp = requests.post(
            f"{_SERVER_URL}/runs",
            json={"project": self.project, "name": self.name or "", "config": self.config},
            timeout=2,
        )
        resp.raise_for_status()
        self.id = resp.json()["id"]
        print(f"[vantrace] run started (server mode): project={self.project} id={self.id}")
        print(f"[vantrace] server: {_SERVER_URL}")

    def _init_local_run(self):
        self.id = str(uuid.uuid4())[:8]
        label = self.name if self.name else "run"
        db_path = _DB_DIR / self.project / f"{label}-{self.id}.db"
        self._conn_path = db_path
        self._conn = _init_local_db(db_path)
        self._conn.execute("INSERT INTO run_meta VALUES (?, ?)", ("config", json.dumps(self.config)))
        self._conn.execute("INSERT INTO run_meta VALUES (?, ?)", ("started_at", str(time.time())))
        self._conn.commit()
        print(f"[vantrace] run started (local mode): project={self.project} name={label} id={self.id}")
        print(f"[vantrace] local db: {db_path}")
        print(f"[vantrace] (no server detected at {_SERVER_URL} — run 'vantrace-server' to enable live dashboard)")

    def _writer_loop(self):
        while not self._stop.is_set() or not self._queue.empty():
            try:
                item = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue

            batch = [item]
            while True:
                try:
                    batch.append(self._queue.get_nowait())
                except queue.Empty:
                    break

            if self._use_server:
                self._flush_to_server(batch)
            else:
                self._flush_to_local(batch)

    def _flush_to_server(self, batch):
        metrics = [{"step": s, "key": k, "value": v} for (s, k, v, _ts) in batch]
        try:
            requests.post(
                f"{_SERVER_URL}/runs/{self.id}/metrics",
                json={"metrics": metrics},
                timeout=2,
            )
        except requests.RequestException as e:
            print(f"[vantrace] warning: failed to send metrics to server: {e}")

    def _flush_to_local(self, batch):
        for step, key, value, ts in batch:
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

    def log_artifact(self, path: str, role: str = "output") -> str:
        """Attach a file to this run. Returns the artifact's content hash (server mode)
        or local storage path (local mode)."""
        file_path = Path(path)
        if not file_path.exists():
            raise FileNotFoundError(f"Artifact file not found: {path}")

        if self._use_server:
            return self._log_artifact_server(file_path, role)
        else:
            return self._log_artifact_local(file_path, role)

    def _log_artifact_server(self, file_path: Path, role: str) -> str:
        with open(file_path, "rb") as f:
            resp = requests.post(
                f"{_SERVER_URL}/runs/{self.id}/artifacts",
                files={"file": (file_path.name, f)},
                data={"role": role},
                timeout=30,
            )
        resp.raise_for_status()
        result = resp.json()
        print(f"[vantrace] artifact logged: {file_path.name} ({result['size']} bytes, hash={result['hash'][:8]})")
        return result["hash"]

    def _log_artifact_local(self, file_path: Path, role: str) -> str:
        artifact_dir = self._conn_path.parent / "artifacts"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        dest = artifact_dir / file_path.name
        shutil.copy2(file_path, dest)

        self._conn.execute(
            "INSERT INTO run_meta VALUES (?, ?)",
            (f"artifact:{file_path.name}", json.dumps({"role": role, "path": str(dest)})),
        )
        self._conn.commit()
        print(f"[vantrace] artifact logged (local mode): {file_path.name} -> {dest}")
        return str(dest)

    def finish(self):
        self._stop.set()
        self._writer_thread.join()

        if self._use_server:
            try:
                requests.post(f"{_SERVER_URL}/runs/{self.id}/finish", timeout=2)
            except requests.RequestException as e:
                print(f"[vantrace] warning: failed to mark run finished on server: {e}")
        else:
            self._conn.execute("INSERT INTO run_meta VALUES (?, ?)", ("finished_at", str(time.time())))
            self._conn.commit()
            self._conn.close()

        print(f"[vantrace] run finished: {self.id}")


def init(project: str, config: dict | None = None, name: str | None = None) -> Run:
    global _active_run
    _active_run = Run(project=project, config=config, name=name)
    atexit.register(lambda: _active_run.finish() if _active_run else None)
    return _active_run


def log(metrics: dict, step: int | None = None):
    if _active_run is None:
        raise RuntimeError("vantrace.init() must be called before vantrace.log()")
    _active_run.log(metrics, step=step)


def log_artifact(path: str, role: str = "output") -> str:
    if _active_run is None:
        raise RuntimeError("vantrace.init() must be called before vantrace.log_artifact()")
    return _active_run.log_artifact(path, role=role)


def finish():
    global _active_run
    if _active_run is not None:
        _active_run.finish()
        _active_run = None
