import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { colorForIndex } from './colors'

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

function StatusDot({ finished }: { finished: boolean }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${
        finished ? 'bg-[var(--color-good)]' : 'bg-[var(--color-accent)] pulse-dot'
      }`}
    />
  )
}

export function Workspace({ project }: { project: string }) {
  const [visibleRunIds, setVisibleRunIds] = useState<Set<string>>(new Set())

  const { data: projectRuns } = useQuery({
    queryKey: ['workspace-runs', project],
    queryFn: () => fetchRunsForProject(project),
    refetchInterval: 3000,
  })

  useEffect(() => {
    if (projectRuns && projectRuns.length > 0) {
      setVisibleRunIds(new Set(projectRuns.map((r) => r.id)))
    }
  }, [project, projectRuns?.length])

  const runsWithColor = useMemo(() => {
    if (!projectRuns) return []
    return projectRuns.map((run, i) => ({ run, color: colorForIndex(i) }))
  }, [projectRuns])

  function toggleRun(id: string) {
    setVisibleRunIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (!projectRuns) return
    setVisibleRunIds(new Set(projectRuns.map((r) => r.id)))
  }

  function selectNone() {
    setVisibleRunIds(new Set())
  }

  return (
    <div className="flex gap-6 -my-8">
      <div className="w-60 shrink-0 border-r border-[var(--color-border)] py-8 pr-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Runs ({runsWithColor.length})
          </span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]">all</button>
            <button onClick={selectNone} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]">none</button>
          </div>
        </div>

        <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
          {runsWithColor.map(({ run, color }) => {
            const isVisible = visibleRunIds.has(run.id)
            return (
              <label
                key={run.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-surface)] cursor-pointer"
              >
                <input type="checkbox" checked={isVisible} onChange={() => toggleRun(run.id)} className="sr-only" />
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                  style={{ backgroundColor: color, opacity: isVisible ? 1 : 0.25 }}
                />
                <span className={`text-xs font-mono truncate flex-1 ${isVisible ? 'text-[var(--color-ink)]' : 'text-[var(--color-muted)]'}`}>
                  {run.name || run.id}
                </span>
                <StatusDot finished={!!run.finished_at} />
              </label>
            )
          })}
        </div>
      </div>

      <div className="flex-1 py-8">
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-3">
          {visibleRunIds.size} run{visibleRunIds.size !== 1 ? 's' : ''} selected
        </p>
        <div className="border border-dashed border-[var(--color-border)] rounded-lg p-16 text-center">
          <p className="text-[var(--color-muted)] text-sm">
            Overlay charts coming next — this area will plot selected runs' metrics together.
          </p>
        </div>
      </div>
    </div>
  )
}
