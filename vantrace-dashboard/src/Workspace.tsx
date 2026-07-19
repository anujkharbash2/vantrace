import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import uPlot from 'uplot'
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

function StatusDot({ finished }: { finished: boolean }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${
        finished ? 'bg-[var(--color-good)]' : 'bg-[var(--color-accent)] pulse-dot'
      }`}
    />
  )
}

function formatGroupValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4)
  return String(v)
}

interface RunWithColor {
  run: RunSummary
  color: string
  groupLabel: string | null
}

function buildAlignedData(
  metricKey: string,
  runsWithMetrics: { run: RunSummary; color: string; groupLabel: string | null; metrics: MetricPoint[] }[]
): { data: uPlot.AlignedData; series: uPlot.Series[] } {
  const perRunValues: (number | null)[][] = runsWithMetrics.map(({ metrics }) => {
    const points = metrics.filter((p) => p.key === metricKey).sort((a, b) => a.step - b.step)
    return points.map((p) => p.value)
  })

  const maxLen = Math.max(0, ...perRunValues.map((v) => v.length))
  const xIndices = Array.from({ length: maxLen }, (_, i) => i)

  const seriesData: (number | null)[][] = perRunValues.map((values) =>
    xIndices.map((i) => (i < values.length ? values[i] : null))
  )

  const series: uPlot.Series[] = [
    {},
    ...runsWithMetrics.map(({ run, color, groupLabel }) => ({
      label: groupLabel ? `${run.name || run.id} (${groupLabel})` : run.name || run.id,
      stroke: color,
      width: 2,
      points: { show: false },
      spanGaps: true,
    })),
  ]

  return { data: [xIndices, ...seriesData] as uPlot.AlignedData, series }
}

function OverlayChart({
  metricKey,
  runsWithMetrics,
}: {
  metricKey: string
  runsWithMetrics: { run: RunSummary; color: string; groupLabel: string | null; metrics: MetricPoint[] }[]
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  const { data, series } = useMemo(
    () => buildAlignedData(metricKey, runsWithMetrics),
    [metricKey, runsWithMetrics]
  )

  useEffect(() => {
    if (!wrapperRef.current) return
    if (plotRef.current) {
      plotRef.current.destroy()
      plotRef.current = null
    }
    const opts: uPlot.Options = {
      width: wrapperRef.current.clientWidth,
      height: 240,
      title: metricKey,
      scales: { x: { time: false } },
      legend: { show: true },
      series,
      axes: [
        { stroke: '#8a877d', grid: { stroke: '#ece9df' } },
        { stroke: '#8a877d', grid: { stroke: '#ece9df' } },
      ],
    }
    plotRef.current = new uPlot(opts, data, wrapperRef.current)

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width && plotRef.current) plotRef.current.setSize({ width, height: 240 })
    })
    observer.observe(wrapperRef.current)

    return () => {
      observer.disconnect()
      plotRef.current?.destroy()
      plotRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKey, runsWithMetrics.map((r) => r.run.id).join(',')])

  useEffect(() => {
    if (plotRef.current) plotRef.current.setData(data)
  }, [data])

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-surface)] card-elevated">
      <div ref={wrapperRef} className="w-full" />
    </div>
  )
}

export function Workspace({ project }: { project: string }) {
  const [visibleRunIds, setVisibleRunIds] = useState<Set<string>>(new Set())
  const [searchFilter, setSearchFilter] = useState('')
  const [groupByKey, setGroupByKey] = useState<string | null>(null)

  const { data: projectRuns } = useQuery({
    queryKey: ['workspace-runs', project],
    queryFn: () => fetchRunsForProject(project),
    refetchInterval: 3000,
  })

  useEffect(() => {
    if (projectRuns && projectRuns.length > 0) {
      setVisibleRunIds(new Set(projectRuns.map((r) => r.id)))
    }
    setGroupByKey(null)
    setSearchFilter('')
  }, [project, projectRuns?.length])

  const configKeys = useMemo(() => {
    if (!projectRuns) return []
    const keys = new Set<string>()
    projectRuns.forEach((r) => Object.keys(r.config || {}).forEach((k) => keys.add(k)))
    return Array.from(keys).sort()
  }, [projectRuns])

  // when grouping, distinct group values share a color; ungrouped runs get per-run colors
  const runsWithColor: RunWithColor[] = useMemo(() => {
    if (!projectRuns) return []

    if (!groupByKey) {
      return projectRuns.map((run, i) => ({ run, color: colorForIndex(i), groupLabel: null }))
    }

    const groupValues = Array.from(
      new Set(projectRuns.map((r) => formatGroupValue(r.config?.[groupByKey] ?? '—')))
    ).sort()
    const colorForGroup = new Map(groupValues.map((v, i) => [v, colorForIndex(i)]))

    return projectRuns.map((run) => {
      const label = formatGroupValue(run.config?.[groupByKey] ?? '—')
      return { run, color: colorForGroup.get(label)!, groupLabel: `${groupByKey}=${label}` }
    })
  }, [projectRuns, groupByKey])

  const filteredRuns = useMemo(() => {
    if (!searchFilter.trim()) return runsWithColor
    const q = searchFilter.toLowerCase()
    return runsWithColor.filter(
      ({ run }) => (run.name || run.id).toLowerCase().includes(q)
    )
  }, [runsWithColor, searchFilter])

  // group the sidebar list into sections when grouping is active
  const groupedSections = useMemo(() => {
    if (!groupByKey) return null
    const sections = new Map<string, RunWithColor[]>()
    for (const rc of filteredRuns) {
      const label = rc.groupLabel!
      if (!sections.has(label)) sections.set(label, [])
      sections.get(label)!.push(rc)
    }
    return Array.from(sections.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredRuns, groupByKey])

  const visibleRunsWithColor = runsWithColor.filter(({ run }) => visibleRunIds.has(run.id))

  const metricsQueries = useQueries({
    queries: visibleRunsWithColor.map(({ run }) => ({
      queryKey: ['workspace-metrics', run.id],
      queryFn: () => fetchMetrics(run.id),
      refetchInterval: 3000,
    })),
  })

  const runsWithMetrics = useMemo(() => {
    return visibleRunsWithColor.map((rc, i) => ({ ...rc, metrics: metricsQueries[i]?.data ?? [] }))
  }, [visibleRunsWithColor, metricsQueries])

  const allMetricKeys = useMemo(() => {
    const keys = new Set<string>()
    runsWithMetrics.forEach(({ metrics }) => metrics.forEach((m) => keys.add(m.key)))
    return Array.from(keys).sort()
  }, [runsWithMetrics])

  const isLoadingMetrics = metricsQueries.some((q) => q.isLoading)

  function toggleRun(id: string) {
    setVisibleRunIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(runs: RunWithColor[]) {
    const ids = runs.map((r) => r.run.id)
    const allVisible = ids.every((id) => visibleRunIds.has(id))
    setVisibleRunIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (allVisible ? next.delete(id) : next.add(id)))
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

  function RunRow({ run, color }: RunWithColor) {
    const isVisible = visibleRunIds.has(run.id)
    return (
      <label
        key={run.id}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-base)] cursor-pointer"
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
  }

  return (
    <div className="flex gap-6 -my-8">
      <div className="w-64 shrink-0 border-r border-[var(--color-border)] py-8 pr-4">
        <input
          type="text"
          placeholder="Filter runs…"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="w-full bg-[var(--color-base)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--color-ink)] mb-3 placeholder:text-[var(--color-muted)]"
        />

        {configKeys.length > 0 && (
          <div className="mb-3">
            <label className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] block mb-1">
              Group by
            </label>
            <select
              value={groupByKey ?? ''}
              onChange={(e) => setGroupByKey(e.target.value || null)}
              className="w-full bg-[var(--color-base)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
            >
              <option value="">None</option>
              {configKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Runs ({filteredRuns.length})
          </span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]">all</button>
            <button onClick={selectNone} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]">none</button>
          </div>
        </div>

        <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto">
          {!groupByKey &&
            filteredRuns.map((rc) => <RunRow key={rc.run.id} {...rc} />)}

          {groupByKey &&
            groupedSections?.map(([label, runs]) => (
              <div key={label} className="mb-2">
                <button
                  onClick={() => toggleGroup(runs)}
                  className="flex items-center gap-2 w-full px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: runs[0].color }} />
                  {label} ({runs.length})
                </button>
                {runs.map((rc) => <RunRow key={rc.run.id} {...rc} />)}
              </div>
            ))}

          {filteredRuns.length === 0 && (
            <p className="text-xs text-[var(--color-muted)] px-2 py-1.5">No runs match.</p>
          )}
        </div>
      </div>

      <div className="flex-1 py-8 min-w-0">
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-4">
          {visibleRunIds.size} run{visibleRunIds.size !== 1 ? 's' : ''} selected
          {groupByKey && ` · grouped by ${groupByKey}`}
        </p>

        {visibleRunIds.size === 0 && (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-16 text-center">
            <p className="text-[var(--color-muted)] text-sm">Select at least one run to see charts.</p>
          </div>
        )}

        {visibleRunIds.size > 0 && isLoadingMetrics && (
          <p className="text-[var(--color-muted)] text-sm">Loading metrics…</p>
        )}

        {visibleRunIds.size > 0 && !isLoadingMetrics && allMetricKeys.length === 0 && (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-16 text-center">
            <p className="text-[var(--color-muted)] text-sm">No metrics logged yet for the selected runs.</p>
          </div>
        )}

        {allMetricKeys.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {allMetricKeys.map((key) => (
              <OverlayChart key={key} metricKey={key} runsWithMetrics={runsWithMetrics} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
