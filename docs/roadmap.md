# Anvesh Labs — Product & Build Roadmap
### Open-source, local-first experiment tracking + LLM observability
 
---
## 1. Positioning (recap)
 
**Core thesis:** A genuinely open-source, local-first ML experiment tracking platform — SDK, server, and dashboard all free and self-hostable by default — with native LLM/agent tracing built in as one integrated capability, not bolted on.
 
**Primary wedge:** classic ML experiment tracking (larger market, less contested).
**Secondary differentiator:** unified LLM tracing in the same tool (nobody open-source does both well).
 
**Non-negotiables baked into every phase:**
- No telemetry phoning home by default
- No account required to start
- Never blocks the training loop (async logging)
- SDK API close enough to W&B's (`init/log/config/finish`) that migration is a one-line import change
---
 
## 2. Architecture overview
 
```
┌─────────────────────────────────────────────────────────────┐
│  vantrace-sdk (Python)                                          │
│  - init(), log(), config, artifact(), finish()                │
│  - async local buffering + batched writes                     │
│  - OpenTelemetry-native tracing hooks (for LLM/agent calls)   │
└───────────────────────────┬────────────────────────────────┘
                             │ writes to local disk OR ships to server
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  vantrace-server (Go)                                            │
│  - ingestion API (metrics, artifacts, traces)                 │
│  - SQLite (local mode) / Postgres (team mode)                 │
│  - object storage adapter (local disk / S3-compatible)        │
│  - sweep orchestrator                                          │
│  - auth (team mode only — none needed in local mode)          │
└───────────────────────────┬────────────────────────────────┘
                             │ REST/gRPC + WebSocket (live updates)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  vantrace-dashboard (React + TypeScript)                         │
│  - run comparison, live charts, artifact/model registry UI    │
│  - sweep leaderboard, trace/eval viewer                        │
└─────────────────────────────────────────────────────────────┘
 
           vantrace-cli (Go) → `vantrace ui`, `vantrace sweep`, `vantrace serve`
```
 
**Why Go for the server:** strong concurrency for high-volume metric ingestion (directly fixes W&B's "logging slows down training" complaint), single static binary (zero-dependency local install — huge UX win over W&B's Python server stack), good enough ecosystem for SQLite/Postgres/gRPC. Python stays where it belongs: the SDK, since that's what ML researchers actually touch.
 
**Why React/TS for dashboard:** fastest path to a UI that feels as polished as W&B's, large component ecosystem for charts (visx, Recharts, or uPlot for high-density metric plots).
 
---
 
## 3. Team split (backend / frontend / ML)
 
| Track | Owns |
|---|---|
| **Backend (Go)** | vantrace-server, storage engines, ingestion API, sweep orchestrator, auth (team mode) |
| **Frontend (React/TS)** | vantrace-dashboard: charts, run comparison, artifact browser, trace viewer |
| **ML-specialist** | vantrace-sdk API design, framework integrations (PyTorch/TF/JAX/sklearn hooks), sweep algorithms (grid/random/Bayesian), eval/trace schema design for LLM layer |
 
All three tracks can run in parallel from day one once the ingestion API contract (schema) is agreed — that contract is the first thing to lock down.
 
---
 
## 4. Phased roadmap — every phase is a fully usable release
 
### **Phase 0 — Foundations (Weeks 1–3)**
- Lock ingestion API schema (metrics, config, artifacts, system stats) — this blocks all 3 tracks, do it first
- Repo structure, CI/CD, license (Apache 2.0 recommended — matches ecosystem norms, enterprise-friendly)
- `vantrace-sdk` skeleton: `init()`, `log()`, `finish()` writing to local SQLite, no server needed yet
### **Phase 1 — v0.1: Local experiment tracker (Weeks 3–8)**
- SDK: full metric/hyperparameter/system-stat logging, async batched writes (never blocks training)
- Local server (Go) + SQLite backend, `vantrace serve` single-binary launch
- Dashboard: run list, live metric charts, run comparison (overlay/table), basic filtering/search
- Framework integrations: PyTorch, TensorFlow/Keras, scikit-learn, HuggingFace Trainer
- **Deliverable: a fully offline, single-machine tool that replaces 80% of daily W&B usage.**
### **Phase 2 — v0.2: Artifacts & model registry (Weeks 8–13)**
- Content-addressed artifact storage (datasets, checkpoints, models) — dedup via hashing like git-lfs/DVC
- Lineage graph: run → artifact → downstream run
- Model registry UI: staging/production tags, version diffing
- Artifact storage backends: local disk (default) + optional S3-compatible adapter
### **Phase 3 — v0.3: Sweeps (Weeks 13–17)**
- Sweep orchestrator in Go server: grid, random, Bayesian (start with Optuna-style TPE via a Python worker bridge, or port to Go later)
- Local multi-process/multi-GPU sweep execution
- Sweep leaderboard + parallel-coordinates plot in dashboard
### **Phase 4 — v0.4: Self-hosted team server (Weeks 17–22)**
- Multi-user auth, workspace/project permissions
- Postgres backend option (swap-in, same API)
- Same single-binary deploy philosophy — `docker run vantrace/server` for a team, still zero telemetry, still fully open
- Real-time collaboration: shared dashboards, comments on runs
### **Phase 5 — v0.5: Native LLM/agent observability (Weeks 22–30)**
- OpenTelemetry-native trace ingestion (not W&B's proprietary-schema-first approach — OTel first, always)
- Prompt versioning + prompt diff view
- Eval datasets + eval run comparison
- Trace viewer: span tree, token/cost breakdown, latency waterfall
- This is where you directly undercut Weave's "add-on" weakness — traces and classic experiment runs live in the *same* project, same dashboard, same artifact lineage
### **Phase 6 — v0.6: Performance hardening (Weeks 30–34)**
- Load test ingestion at W&B's known weak point: tens of thousands of data points across hundreds of concurrent runs
- Streaming writes, downsampling for chart rendering, pagination everywhere
- Benchmark publicly against W&B and MLflow — this becomes a marketing asset
### **Phase 7 — v0.7+: Enterprise-readiness (ongoing, open-core optional)**
- SSO (OAuth/SAML/SCIM), RBAC, audit logs
- Distributed/multi-node training monitoring
- SOC 2 track *only if* you pursue a managed hosted tier later — core stays free either way
---
 
## 5. What "don't leave anything out" means in practice
 
To make sure nothing gets dropped as scope grows, treat these as permanent parallel workstreams, not one-time tasks:
 
- **Docs site** — start in Phase 1, not after. Undocumented OSS tools die.
- **Migration guide from W&B** — literally a find-and-replace guide (`wandb.init` → `vantrace.init`). Ship this alongside v0.1.
- **Public benchmarks page** — logging speed, dashboard load time vs W&B/MLflow. Update every phase.
- **Community channel (Discord/GitHub Discussions)** — open this at v0.1 launch, not later.
- **Integration tests against real training loops** (PyTorch/HF), not just unit tests — catches the "blocks the training loop" regression class early.
---
 
## 6. Current Status
 
**Last updated: 2026-07-17**
 
- ✅ Repo structure created: `vantrace-sdk/`, `vantrace-server/`, `vantrace-dashboard/`, `docs/`
- ✅ Go module initialized (`vantrace-server`) — not yet built
- ✅ Python SDK core built (`vantrace-sdk`): `init()`, `log()`, `finish()`
  - Async buffered writes to local SQLite (`~/.vantrace/runs/<project>/<name>-<id>.db`)
  - Verified working end-to-end with a live test script
  - Installed in editable mode, importable as `import vantrace`
- ✅ First commit pushed to `main` (`556f09e`): "feat: v0.1 SDK core - init/log/finish with async local SQLite writes"
- ✅ Config/hyperparameter retrieval — stored and queryable via CLI
- ✅ `vantrace` CLI built: `vantrace list` (all runs, step counts, status), `vantrace show <run_id_or_project>` (config, metrics, falls back to latest run if given a project name)
- ✅ Second commit pushed: "feat: vantrace CLI - list and show runs from terminal"
- ✅ Go server (`vantrace-server`) built and verified end-to-end:
  - `GET /health`
  - `POST /runs` (create run + config)
  - `POST /runs/{id}/metrics` (log metric points)
  - `POST /runs/{id}/finish`
  - `GET /runs` (list all runs)
  - Backed by SQLite via pure-Go driver (`modernc.org/sqlite` — avoids CGO/C-compiler dependency on macOS)
  - Full chain confirmed: HTTP request → Go handler → SQLite write → readable back out
- ✅ SDK wired to server over HTTP with automatic fallback:
  - Tries `GET /health` on init; if server's up, sends run/metrics/finish via HTTP
  - If no server detected, falls back to local-only SQLite (original v0.1 behavior), with a console note telling the user how to enable server mode
  - Verified both modes end-to-end (server mode confirmed via `curl`, local mode confirmed via `vantrace list`)
- ✅ Dashboard (`vantrace-dashboard`) scaffolded and live:
  - Vite + React + TypeScript + Tailwind v4 (via `@tailwindcss/vite` plugin) + TanStack Query
  - Run list screen polling `GET /runs` every 2s, dark theme, status/duration columns
  - CORS middleware added to Go server (`Access-Control-Allow-Origin`) to unblock browser requests from `:5173` to `:6789`
- ✅ Per-run metrics endpoint (`GET /runs/{id}/metrics`) built and verified
- ✅ Run detail screen with live uPlot charts:
  - Click a run in the list → shows one chart per logged metric key (loss, accuracy, etc.)
  - Polls every 2s for live updates during active training
  - Confirmed working end-to-end with no console errors
- ✅ Live end-to-end test passed: realistic training-loop script with delays, watched run appear, chart update live, and status flip to finished in real time
- ✅ Dashboard UI/UX pass:
  - Fixed responsive bug (charts overlapped on narrow screens due to fixed uPlot width + `grid-cols-2`) — charts now resize fluidly via `ResizeObserver`, grid stacks to 1 column on small screens
  - Visual design pass: warm-black theme, single amber accent (used only for "running" status + header signature line), Inter (UI) + JetBrains Mono (technical data) typefaces, pulse animation on active runs
- ⬜ Phase 2: artifacts & model registry — **next up**
**v0.1 is functionally complete:** SDK (local or server mode) → Go server (SQLite) → React dashboard (live run list + live per-run charts), responsive, visually polished. This is a genuinely usable local experiment tracker.
 
- ✅ **Real-world validation:** trained an actual PyTorch CNN on MNIST end-to-end through vantrace (98.82% val accuracy, 3 epochs, MPS device). Confirmed:
  - High-frequency logging (train_loss every 50 batches) rendered cleanly, no lag
  - Sparse per-epoch logging (val_loss/val_accuracy, 3 points) also handled correctly
  - Full pipeline held up under real research-scale usage, not just synthetic test data
- **v0.1 is proven, not just built.** Ready to move to Phase 2.
## Phase 2 progress
 
- ✅ Storage interface (`Storage`) designed as pluggable — local disk implemented now, S3-compatible backend can be added later without changing callers
- ✅ Content-addressed local storage: files hashed (SHA-256), deduped, stored in git-style `xx/yyyy...` layout
- ✅ `artifacts` + `run_artifacts` tables added to schema (tracks hash/filename/size/content-type, and per-run role: "output" or "input" — this is what will drive lineage)
- ✅ Endpoints built and verified end-to-end: `POST /runs/{id}/artifacts` (upload), `GET /runs/{id}/artifacts` (list), `GET /artifacts/{hash}` (download)
- ✅ Full round-trip confirmed via curl: upload → hash → stored → listed → downloaded byte-identical
- ⬜ SDK API (`run.log_artifact()`) — **next up**
- ⬜ Dashboard artifact browser UI
**Next step:** add `log_artifact()` to the Python SDK so researchers can actually attach files (checkpoints, datasets) to a run from their training code, not just via raw curl.
 
## 7. Decision Log
 
| Date | Decision | Reasoning |
|---|---|---|
| 2026-07-17 | Product renamed: Anuez Labs → **Anvesh Labs**, product name **Vantrace** | Founder naming decision |
| 2026-07-17 | Go for server, Python for SDK, React/TS for dashboard | Go handles high-volume concurrent ingestion without blocking training (fixes W&B's known weak point); Python SDK matches researcher expectations and W&B migration path; React/TS gives fastest path to polished dashboard UX |
| 2026-07-17 | SQLite for local mode, Postgres planned for team mode (Phase 4) | Zero-config local start, swap-in path to scale later without changing API contract |
| 2026-07-17 | `name` param defaults to `None` (not `self.id`) to avoid duplicated run filenames | Caught during first live test — filename was `id-id.db` |
| 2026-07-17 | Async writer thread + queue for `log()` calls | Directly addresses documented W&B complaint: synchronous logging slows down training loop |
| 2026-07-17 | CLI viewer built before the Go server/dashboard | Fastest path to a usable feedback loop — verify SDK data is correct and inspectable before investing in server/UI layers |
| 2026-07-17 | `vantrace show <name>` falls back to matching by project name (shows latest run) if no run ID matches | Real usage pattern — people will type the project name far more often than a specific run ID |
| 2026-07-18 | Used `modernc.org/sqlite` (pure Go) instead of `mattn/go-sqlite3` for the server's DB driver | Avoids CGO/C-compiler toolchain requirement — keeps `go build` simple and portable, especially for a single-binary local install philosophy |
| 2026-07-18 | Server owns a separate SQLite DB (`~/.vantrace/server.db`) from the SDK's local-only DB | Server mode and local-only mode are two independent paths for now; unifying them is the next step (SDK → HTTP → server) |
| 2026-07-18 | SDK auto-detects server via `/health` check on init, falls back to local SQLite if unavailable | Keeps SDK usable standalone (matches Phase 1 promise) while enabling live dashboard when a server is running — best of both without user configuration |
| 2026-07-18 | Dashboard stack: Vite + React + TS + Tailwind v4 + TanStack Query + uPlot (not Recharts) | uPlot handles dense, high-frequency, live-updating metric data far better than Recharts — directly avoids repeating W&B's chart-performance weak point at scale |
| 2026-07-18 | Added permissive CORS middleware to Go server | Dashboard (`:5173`) and server (`:6789`) are different origins during local dev; browser blocks cross-origin requests without explicit headers |
 
## 8. Immediate next step
 
The single highest-leverage task right now: **lock the ingestion API schema** (Phase 0). Everything — SDK, server, dashboard — depends on it, and changing it later is expensive across three parallel tracks.
 
I can draft that schema (metrics, config, artifacts, system-stats, trace spans) as a concrete spec next, or scaffold the actual `vantrace-sdk` Python package structure — whichever you want to start with.
 