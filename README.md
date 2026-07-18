# Vantrace

Local-first, open-source experiment tracking for machine learning research.

Vantrace lets you log metrics, hyperparameters, and artifacts from your training runs, run hyperparameter sweeps, and manage model versions — all in a live dashboard running entirely on your own machine. No account, no cloud dependency, no data leaving your infrastructure unless you choose to deploy it that way.

---

## Features

- **Metric logging** — track losses, accuracy, or any custom metric per training step, with async writes that never block your training loop
- **Live dashboard** — a web UI that updates in real time while training runs, showing run comparisons and per-metric charts
- **Local-first by default** — works fully offline with zero configuration; automatically upgrades to a shared server when one is available
- **Artifact storage** — log datasets, checkpoints, or model weights, with automatic content-based deduplication
- **Model registry** — tag artifacts (e.g. `staging`, `production`) to track which model version is deployed
- **Lineage tracking** — trace which run produced or consumed any given artifact
- **Hyperparameter sweeps** — grid search across a config space, with each trial automatically logged as its own run
- **Sweep leaderboard** — rank runs by any metric, with hyperparameter columns and automatic best/worst sort direction
- **CLI** — inspect runs and metrics directly from the terminal

---

## Architecture

Vantrace is composed of three independent components:

```
vantrace-sdk/         Python SDK — init(), log(), log_artifact(), finish(), sweep tools
vantrace-server/      Go ingestion server — HTTP API, SQLite storage
vantrace-dashboard/   React dashboard — live run list, charts, registry, lineage, leaderboard
```

The SDK can operate in two modes:

- **Local mode** — writes directly to a local SQLite file (`~/.vantrace/runs/`). No server required.
- **Server mode** — if a Vantrace server is running (`vantrace-server`), the SDK automatically detects it and streams data over HTTP instead, enabling the live dashboard.

This detection is automatic — no configuration is required to switch between the two.

---

## Installation

### Prerequisites

- Python 3.10+
- Go 1.22+ (only required if running the server/dashboard)
- Node.js 18+ (only required for the dashboard)

### SDK

```bash
cd vantrace-sdk
pip install -e .
```

This installs the `vantrace` Python package and the `vantrace` CLI command.

### Server (optional, enables the live dashboard)

```bash
cd vantrace-server
go run .
```

The server starts on `http://localhost:6789` by default and stores data in `~/.vantrace/`.

### Dashboard (optional)

```bash
cd vantrace-dashboard
npm install
npm run dev
```

The dashboard runs on `http://localhost:5173` and connects to the server automatically.

---

## Usage

### Logging a run

```python
import vantrace

run = vantrace.init(
    project="mnist-cnn",
    name="baseline",
    config={"lr": 0.001, "epochs": 10, "batch_size": 64},
)

for step in range(100):
    vantrace.log({"loss": loss_value, "accuracy": acc_value}, step=step)

vantrace.finish()
```

If a Vantrace server is running, this run and its metrics appear live in the dashboard. If not, everything is still logged locally and can be inspected via the CLI.

### Logging an artifact

```python
vantrace.log_artifact("model_checkpoint.pt", role="output")
```

Artifacts are content-addressed (hashed on upload), so logging the same file from multiple runs only stores it once.

### Running a hyperparameter sweep

```python
from vantrace.sweep import grid_search, run_sweep
import functools

def train_fn(config, device, train_set, val_set):
    run = vantrace.init(project="mnist-sweep", config=config)
    # ... training loop, vantrace.log(...) per step/epoch ...
    vantrace.finish()
    return val_accuracy  # score used to rank configs

search_space = {"lr": [0.01, 0.001], "batch_size": [32, 64]}
configs = grid_search(search_space)

bound_train_fn = functools.partial(train_fn, device=device, train_set=train_set, val_set=val_set)
best = run_sweep(configs, bound_train_fn)
print(best)  # {"lr": 0.001, "batch_size": 64, "score": 0.9848}
```

Each config in the sweep is automatically logged as its own Vantrace run — open the dashboard's **Leaderboard** tab, pick the project and metric, and see every trial ranked with its hyperparameters as columns.

### Inspecting runs from the CLI

```bash
vantrace list                      # list all local runs
vantrace show <run_id_or_project>  # show config and metrics for a run
```

### Promoting a model in the registry

```bash
curl -X POST http://localhost:6789/projects/<project>/registry \
  -H "Content-Type: application/json" \
  -d '{"hash": "<artifact_hash>", "tag": "production"}'
```

Registry tags and artifact lineage are also viewable in the dashboard under the **Registry** tab — click any artifact hash to see which run produced or consumed it.

---

## API reference (server)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/runs` | Create a new run |
| POST | `/runs/{id}/metrics` | Log metric points to a run |
| POST | `/runs/{id}/finish` | Mark a run as finished |
| GET | `/runs` | List all runs (supports `?project=` filter, includes config) |
| GET | `/runs/{id}/metrics` | Get all metrics for a run |
| POST | `/runs/{id}/artifacts` | Upload an artifact to a run |
| GET | `/runs/{id}/artifacts` | List artifacts attached to a run |
| GET | `/artifacts/{hash}` | Download an artifact by content hash |
| GET | `/artifacts/{hash}/lineage` | Get runs that produced/consumed an artifact |
| POST | `/projects/{project}/registry` | Promote/tag an artifact in the registry |
| GET | `/projects/{project}/registry` | List tagged artifacts for a project |

---

## Project structure

```
Vantrace/
├── vantrace-sdk/
│   ├── pyproject.toml
│   └── src/vantrace/
│       ├── __init__.py      # Run class, init/log/log_artifact/finish
│       ├── sweep.py          # grid_search, run_sweep
│       └── cli.py            # vantrace CLI
├── vantrace-server/
│   ├── main.go               # entry point, routing
│   ├── db.go                 # SQLite schema and connection
│   ├── handlers.go           # run/metric endpoints
│   ├── artifacts.go          # artifact upload/download/lineage endpoints
│   ├── registry.go           # model registry endpoints
│   └── storage.go            # pluggable Storage interface, local disk implementation
└── vantrace-dashboard/
    └── src/
        ├── App.tsx            # run list, tab navigation
        ├── RunDetail.tsx      # per-run charts and artifacts
        ├── Registry.tsx       # model registry view
        ├── Lineage.tsx        # artifact lineage panel
        └── Leaderboard.tsx    # sweep leaderboard view
```

---

## Versioning

Vantrace follows semantic versioning (`MAJOR.MINOR.PATCH`), tracked via git tags. Current release: **v0.3.0** (hyperparameter sweeps + leaderboard).

| Version | Milestone |
|---|---|
| v0.1.0 | Core experiment tracking — SDK, server, live dashboard |
| v0.2.0 | Artifacts, model registry, lineage tracking |
| v0.3.0 | Hyperparameter sweeps (grid search), sweep leaderboard |

---

## Development status

Vantrace is under active development. Core experiment tracking, artifact/model registry, and hyperparameter sweep functionality are complete and tested against real training workloads (validated with an actual PyTorch CNN trained on MNIST, including binary checkpoint round-trips).

## License

Apache 2.0 (see `LICENSE`).

## Contributing

Issues and pull requests are welcome. This project is in early, active development — expect frequent changes to internal APIs.