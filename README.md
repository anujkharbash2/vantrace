# Vantrace

Local-first, open-source experiment tracking for machine learning research.

Vantrace lets you log metrics, hyperparameters, and artifacts from your training runs, browse them in a live dashboard, and manage model versions, all running entirely on your own machine, with no account, no cloud dependency, and no data leaving your infrastructure unless you choose to deploy it that way.

---

## Features

- **Metric logging** — track losses, accuracy, or any custom metric per training step, with async writes that never block your training loop
- **Live dashboard** — a web UI that updates in real time while training runs, showing run comparisons and per-metric charts
- **Local-first by default** — works fully offline with zero configuration; automatically upgrades to a shared server when one is available
- **Artifact storage** — log datasets, checkpoints, or model weights, with automatic content-based deduplication
- **Model registry** — tag artifacts (e.g. `staging`, `production`) to track which model version is deployed
- **Lineage tracking** — trace which run produced or consumed any given artifact
- **CLI** — inspect runs and metrics directly from the terminal

---

## Architecture

Vantrace is composed of three independent components:

```
vantrace-sdk/         Python SDK — init(), log(), log_artifact(), finish()
vantrace-server/      Go ingestion server — HTTP API, SQLite storage
vantrace-dashboard/   React dashboard — live run list, charts, registry, lineage
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

If a Vantrace server is running, this run and its metrics will appear live in the dashboard. If not, everything is still logged locally and can be inspected via the CLI.

### Logging an artifact

```python
vantrace.log_artifact("model_checkpoint.pt", role="output")
```

Artifacts are content-addressed (hashed on upload), so logging the same file from multiple runs only stores it once.

### Inspecting runs from the CLI

```bash
vantrace list                    # list all local runs
vantrace show <run_id_or_project>  # show config and metrics for a run
```

### Promoting a model in the registry

```bash
curl -X POST http://localhost:6789/projects/<project>/registry \
  -H "Content-Type: application/json" \
  -d '{"hash": "<artifact_hash>", "tag": "production"}'
```

Registry tags and lineage are also viewable in the dashboard under the **Registry** tab.

---

## API reference (server)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/runs` | Create a new run |
| POST | `/runs/{id}/metrics` | Log metric points to a run |
| POST | `/runs/{id}/finish` | Mark a run as finished |
| GET | `/runs` | List all runs |
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
│       └── cli.py           # vantrace CLI
├── vantrace-server/
│   ├── main.go               # entry point, routing
│   ├── db.go                 # SQLite schema and connection
│   ├── handlers.go           # run/metric endpoints
│   ├── artifacts.go          # artifact upload/download/lineage endpoints
│   ├── registry.go           # model registry endpoints
│   └── storage.go            # pluggable Storage interface, local disk implementation
├── vantrace-dashboard/
│   └── src/
│       ├── App.tsx            # run list, tab navigation
│       ├── RunDetail.tsx      # per-run charts and artifacts
│       ├── Registry.tsx       # model registry view
│       └── Lineage.tsx        # artifact lineage panel
└── docs/
    └── roadmap.md             # build roadmap, decision log, current status
```

---

## Development status

Vantrace is under active development. Core experiment tracking and artifact/model registry functionality are complete and tested against real training workloads. See [`docs/roadmap.md`](docs/roadmap.md) for the full build roadmap, architectural decisions, and current progress.

---

## License

Apache 2.0 (see `LICENSE`).

## Contributing

Issues and pull requests are welcome. This project is in early, active development, expect frequent changes to internal APIs.