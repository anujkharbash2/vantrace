import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

const SERVER_URL = 'http://localhost:6789'

interface RunSummary {
  id: string
  project: string
  name: string
  config: Record<string, unknown>
  started_at: number
  finished_at: number | null
}

interface MetricPoint {
  step: number
  key: string
  value: number
}

async function fetchAllRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${SERVER_URL}/runs`)
  if (!res.ok) throw new Error('Failed to fetch runs')
  return res.json()
}

async function fetchRunsForProject(project: string): Promise<RunSummary[]> {
  const res = await fetch(`${SERVER_URL}/runs?project=${encodeURIComponent(project)}`)
  if (!res.ok) throw new Error('Failed to fetch runs')
  return res.json()
}

async function fetchMetrics(runId: string): Promise<MetricPoint[]> {
  const res = await fetch(`${SERVER_URL}/runs/${runId}/metrics`)
  if (!res.ok) throw new Error('Failed to fetch metrics')
  return res.json()
}

function isLowerBetter(metricKey: string): boolean {
  const lower = metricKey.toLowerCase()
  return lower.includes('loss') || lower.includes('error') || lower.includes('perplexity')
}

function lastValueForKey(points: MetricPoint[], key: string): number | null {
  const matches = points.filter((p) => p.key === key)
  if (matches.length === 0) return null
  return matches.reduce((a, b) => (a.step > b.step ? a : b)).value
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(4)
  }
  return String(v)
}

interface LeaderboardRow {
  run: RunSummary
  score: number | null
}

function useLeaderboardData(project: string | null, metricKey: string | null) {
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['leaderboard-runs', project],
    queryFn: () => fetchRunsForProject(project!),
    enabled: !!project,
  })

  const { data: rows, isLoading: metricsLoading } = useQuery({
    queryKey: ['leaderboard-metrics', project, metricKey, runs?.map((r) => r.id).join(',')],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      if (!runs || !metricKey) return []
      const results = await Promise.all(
        runs.map(async (run) => {
          const metrics = await fetchMetrics(run.id)
          const score = lastValueForKey(metrics, metricKey)
          return { run, score }
        })
      )
      const ascending = isLowerBetter(metricKey)
      return results.sort((a, b) => {
        const aVal = a.score ?? (ascending ? Infinity : -Infinity)
        const bVal = b.score ?? (ascending ? Infinity : -Infinity)
        return ascending ? aVal - bVal : bVal - aVal
      })
    },
    enabled: !!runs && !!metricKey,
  })

  return { rows: rows ?? [], isLoading: runsLoading || metricsLoading }
}

export function Leaderboard() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)

  const { data: allRuns } = useQuery({ queryKey: ['runs'], queryFn: fetchAllRuns })

  const projects = useMemo(() => {
    if (!allRuns) return []
    return Array.from(new Set(allRuns.map((r) => r.project))).sort()
  }, [allRuns])

  const activeProject = selectedProject ?? projects[0] ?? null

  // pull available metric keys + hyperparameter keys from the first run's data
  const { data: sampleRuns } = useQuery({
    queryKey: ['leaderboard-sample', activeProject],
    queryFn: () => fetchRunsForProject(activeProject!),
    enabled: !!activeProject,
  })

  const { data: sampleMetrics } = useQuery({
    queryKey: ['leaderboard-sample-metrics', sampleRuns?.[0]?.id],
    queryFn: () => fetchMetrics(sampleRuns![0].id),
    enabled: !!sampleRuns && sampleRuns.length > 0,
  })

  const availableMetricKeys = useMemo(() => {
    if (!sampleMetrics) return []
    return Array.from(new Set(sampleMetrics.map((m) => m.key))).sort()
  }, [sampleMetrics])

  const activeMetric = selectedMetric ?? availableMetricKeys[0] ?? null

  const configKeys = useMemo(() => {
    if (!sampleRuns || sampleRuns.length === 0) return []
    const keys = new Set<string>()
    sampleRuns.forEach((r) => Object.keys(r.config || {}).forEach((k) => keys.add(k)))
    return Array.from(keys).sort()
  }, [sampleRuns])

  const { rows, isLoading } = useLeaderboardData(activeProject, activeMetric)

  if (projects.length === 0) {
    return <p className="text-[var(--color-muted)] text-sm">No projects yet — log a run first.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Project</label>
          <select
            value={activeProject ?? ''}
            onChange={(e) => { setSelectedProject(e.target.value); setSelectedMetric(null) }}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-3 py-1.5 text-sm text-[var(--color-ink)]"
          >
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {availableMetricKeys.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Sort by</label>
            <select
              value={activeMetric ?? ''}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-3 py-1.5 text-sm text-[var(--color-ink)]"
            >
              {availableMetricKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        )}
      </div>

      {isLoading && <p className="text-[var(--color-muted)] text-sm">Loading leaderboard…</p>}

      {!isLoading && rows.length > 0 && (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--color-muted)] text-xs uppercase tracking-wide border-b border-[var(--color-border)]">
                  <th className="py-2.5 px-4 font-medium">Rank</th>
                  <th className="py-2.5 px-4 font-medium">Run</th>
                  {configKeys.map((key) => (
                    <th key={key} className="py-2.5 px-4 font-medium">{key}</th>
                  ))}
                  <th className="py-2.5 px-4 font-medium">{activeMetric} {activeMetric && (isLowerBetter(activeMetric) ? '↓ lower better' : '↑ higher better')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.run.id}
                    className={`border-b border-[var(--color-border)] last:border-0 ${
                      i === 0 ? 'bg-[var(--color-accent)]/10' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      {i === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)]">
                          🏆 #1
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)] text-xs">#{i + 1}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[var(--color-ink)]">
                      {row.run.name || row.run.id}
                    </td>
                    {configKeys.map((key) => (
                      <td key={key} className="py-2.5 px-4 text-[var(--color-muted)] font-mono text-xs">
                        {row.run.config?.[key] !== undefined ? formatValue(row.run.config[key]) : '—'}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 font-mono text-[var(--color-ink)] font-medium">
                      {row.score !== null ? row.score.toFixed(4) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}