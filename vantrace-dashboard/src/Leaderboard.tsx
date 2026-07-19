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
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4)
  return String(v)
}

interface LeaderboardRow {
  run: RunSummary
  score: number | null
}

export function Leaderboard({ project }: { project: string }) {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)

  const { data: runs } = useQuery({
    queryKey: ['leaderboard-runs', project],
    queryFn: () => fetchRunsForProject(project),
  })

  const { data: sampleMetrics } = useQuery({
    queryKey: ['leaderboard-sample-metrics', runs?.[0]?.id],
    queryFn: () => fetchMetrics(runs![0].id),
    enabled: !!runs && runs.length > 0,
  })

  const availableMetricKeys = useMemo(() => {
    if (!sampleMetrics) return []
    return Array.from(new Set(sampleMetrics.map((m) => m.key))).sort()
  }, [sampleMetrics])

  const activeMetric = selectedMetric ?? availableMetricKeys[0] ?? null

  const configKeys = useMemo(() => {
    if (!runs || runs.length === 0) return []
    const keys = new Set<string>()
    runs.forEach((r) => Object.keys(r.config || {}).forEach((k) => keys.add(k)))
    return Array.from(keys).sort()
  }, [runs])

  const { data: rows, isLoading } = useQuery({
    queryKey: ['leaderboard-rows', project, activeMetric, runs?.map((r) => r.id).join(',')],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      if (!runs || !activeMetric) return []
      const results = await Promise.all(
        runs.map(async (run) => {
          const metrics = await fetchMetrics(run.id)
          return { run, score: lastValueForKey(metrics, activeMetric) }
        })
      )
      const ascending = isLowerBetter(activeMetric)
      return results.sort((a, b) => {
        const aVal = a.score ?? (ascending ? Infinity : -Infinity)
        const bVal = b.score ?? (ascending ? Infinity : -Infinity)
        return ascending ? aVal - bVal : bVal - aVal
      })
    },
    enabled: !!runs && !!activeMetric,
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{project}</p>
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

      {!isLoading && rows && rows.length > 0 && (
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
                  <th className="py-2.5 px-4 font-medium">
                    {activeMetric} {activeMetric && (isLowerBetter(activeMetric) ? '↓ lower better' : '↑ higher better')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.run.id}
                    className={`border-b border-[var(--color-border)] last:border-0 ${i === 0 ? 'bg-[var(--color-accent)]/10' : ''}`}
                  >
                    <td className="py-2.5 px-4">
                      {i === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)]">🏆 #1</span>
                      ) : (
                        <span className="text-[var(--color-muted)] text-xs">#{i + 1}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[var(--color-ink)]">{row.run.name || row.run.id}</td>
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
