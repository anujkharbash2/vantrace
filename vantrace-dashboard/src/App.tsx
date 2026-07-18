import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RunDetail } from './RunDetail'
import { Registry } from './Registry'
import { Leaderboard } from './Leaderboard'


const SERVER_URL = 'http://localhost:6789'

interface RunSummary {
  id: string
  project: string
  name: string
  started_at: number
  finished_at: number | null
}

function formatDuration(started: number, finished: number | null): string {
  const end = finished ?? Date.now() / 1000
  const secs = Math.round(end - started)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

async function fetchRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${SERVER_URL}/runs`)
  if (!res.ok) throw new Error('Failed to fetch runs')
  return res.json()
}

function StatusBadge({ finished }: { finished: boolean }) {
  if (finished) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--color-good)] text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-good)]" />
        finished
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--color-accent)] text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] pulse-dot" />
      running
    </span>
  )
}

function App() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'runs' | 'registry' | 'leaderboard'>('runs')
  const { data: runs, isLoading, error } = useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    refetchInterval: 2000,
  })

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-border)] px-6 py-5 sm:px-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-semibold tracking-tight">vantrace</h1>
          <div className="h-px w-16 mt-2 bg-gradient-to-r from-[var(--color-accent)] to-transparent" />
          <p className="text-[var(--color-muted)] text-sm mt-3">
            Local-first experiment tracking
          </p>
          <div className="flex gap-1 mt-5">
            <button
              onClick={() => { setActiveTab('runs'); setSelectedRunId(null) }}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'runs'
                  ? 'bg-[var(--color-surface)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              Runs
            </button>
            <button
              onClick={() => setActiveTab('registry')}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'registry'
                  ? 'bg-[var(--color-surface)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              Registry
            </button>
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'leaderboard'
                  ? 'bg-[var(--color-surface)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              Leaderboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 sm:px-10">
        {activeTab === 'registry' ? (
          <Registry />
        ) : activeTab === 'leaderboard' ? (
          <Leaderboard />
        ) : selectedRunId ? (
          <RunDetail runId={selectedRunId} onBack={() => setSelectedRunId(null)} />
        ) : (
          <>
            {isLoading && (
              <p className="text-[var(--color-muted)] text-sm">Loading runs…</p>
            )}

            {error && (
              <div className="border border-[var(--color-border)] rounded-lg p-6 text-sm">
                <p className="text-red-400 font-medium mb-1">Can't reach the server</p>
                <p className="text-[var(--color-muted)]">
                  No response from {SERVER_URL}. Start it with{' '}
                  <code className="font-mono bg-[var(--color-surface)] px-1.5 py-0.5 rounded">
                    go run .
                  </code>{' '}
                  inside vantrace-server.
                </p>
              </div>
            )}

            {runs && runs.length === 0 && (
              <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
                <p className="text-[var(--color-muted)] text-sm">
                  No runs yet. Log one with{' '}
                  <code className="font-mono">vantrace.init()</code>.
                </p>
              </div>
            )}

            {runs && runs.length > 0 && (
              <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-[var(--color-muted)] text-xs uppercase tracking-wide border-b border-[var(--color-border)]">
                        <th className="py-3 px-4 font-medium">Project</th>
                        <th className="py-3 px-4 font-medium">Run</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr
                          key={run.id}
                          onClick={() => setSelectedRunId(run.id)}
                          className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface)] cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">{run.project}</td>
                          <td className="py-3 px-4 font-mono text-[var(--color-ink)]">
                            {run.name || run.id}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge finished={!!run.finished_at} />
                          </td>
                          <td className="py-3 px-4 text-[var(--color-muted)] font-mono text-xs">
                            {formatDuration(run.started_at, run.finished_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App