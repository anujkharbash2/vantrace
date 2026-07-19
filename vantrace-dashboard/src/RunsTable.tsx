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

async function fetchRunsForProject(project: string): Promise<RunSummary[]> {
  const res = await fetch(`${SERVER_URL}/runs?project=${encodeURIComponent(project)}`)
  if (!res.ok) throw new Error('Failed to fetch runs')
  return res.json()
}

function formatDuration(started: number, finished: number | null): string {
  const end = finished ?? Date.now() / 1000
  const secs = Math.round(end - started)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4)
  return String(v)
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

type SortKey = 'name' | 'status' | 'duration' | string
type SortDir = 'asc' | 'desc'

export function RunsTable({
  project,
  onSelectRun,
}: {
  project: string
  onSelectRun: (id: string) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('duration')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { data: runs, isLoading } = useQuery({
    queryKey: ['runs-table', project],
    queryFn: () => fetchRunsForProject(project),
    refetchInterval: 3000,
  })

  const configKeys = useMemo(() => {
    if (!runs) return []
    const keys = new Set<string>()
    runs.forEach((r) => Object.keys(r.config || {}).forEach((k) => keys.add(k)))
    return Array.from(keys).sort()
  }, [runs])

  const sortedRuns = useMemo(() => {
    if (!runs) return []
    const copy = [...runs]
    copy.sort((a, b) => {
      let aVal: number | string
      let bVal: number | string

      if (sortKey === 'name') {
        aVal = a.name || a.id
        bVal = b.name || b.id
      } else if (sortKey === 'status') {
        aVal = a.finished_at ? 1 : 0
        bVal = b.finished_at ? 1 : 0
      } else if (sortKey === 'duration') {
        aVal = (a.finished_at ?? Date.now() / 1000) - a.started_at
        bVal = (b.finished_at ?? Date.now() / 1000) - b.started_at
      } else {
        aVal = (a.config?.[sortKey] as number) ?? -Infinity
        bVal = (b.config?.[sortKey] as number) ?? -Infinity
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [runs, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const isActive = sortKey === sortKeyValue
    return (
      <th
        onClick={() => handleSort(sortKeyValue)}
        className="py-3 px-4 font-medium cursor-pointer select-none hover:text-[var(--color-ink)] transition-colors"
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive && <span className="text-[var(--color-accent)]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </span>
      </th>
    )
  }

  if (isLoading) return <p className="text-[var(--color-muted)] text-sm">Loading runs…</p>

  if (!runs || runs.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
        <p className="text-[var(--color-muted)] text-sm">No runs in this project yet.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-3">
        {project} · {runs.length} run{runs.length !== 1 ? 's' : ''}
      </p>
      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-[var(--color-muted)] text-xs uppercase tracking-wide border-b border-[var(--color-border)]">
                <SortHeader label="Run" sortKeyValue="name" />
                <SortHeader label="Status" sortKeyValue="status" />
                {configKeys.map((key) => (
                  <SortHeader key={key} label={key} sortKeyValue={key} />
                ))}
                <SortHeader label="Duration" sortKeyValue="duration" />
              </tr>
            </thead>
            <tbody>
              {sortedRuns.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface)] cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-mono text-[var(--color-ink)]">{run.name || run.id}</td>
                  <td className="py-3 px-4">
                    <StatusBadge finished={!!run.finished_at} />
                  </td>
                  {configKeys.map((key) => (
                    <td key={key} className="py-3 px-4 text-[var(--color-muted)] font-mono text-xs">
                      {run.config?.[key] !== undefined ? formatValue(run.config[key]) : '—'}
                    </td>
                  ))}
                  <td className="py-3 px-4 text-[var(--color-muted)] font-mono text-xs">
                    {formatDuration(run.started_at, run.finished_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
