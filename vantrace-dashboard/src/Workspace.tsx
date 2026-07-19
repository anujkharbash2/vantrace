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

interface RunWithColor {
  run: RunSummary
  color: string
}

// Builds uPlot-ready aligned data for ONE metric across MULTIPLE runs.
// x-axis = logged ORDER (1st point, 2nd point, ...) not raw step —
// this keeps runs comparable even when batch size changes how many
// steps happen per epoch.
function buildAlignedData(
  metricKey: string,
  runsWithMetrics: { run: RunSummary; color: string; metrics: MetricPoint[] }[]
): { data: uPlot.AlignedData; series: uPlot.Series[] } {
  const perRunValues: (number | null)[][] = runsWithMetrics.map(({ metrics }) => {
    const points = metrics
      .filter((p) => p.key === metricKey)
      .sort((a, b) => a.step - b.step)
    return points.map((p) => p.value)
  })

  const maxLen = Math.max(0, ...perRunValues.map((v) => v.length))
  const xIndices = Array.from({ length: maxLen }, (_, i) => i)

  const seriesData: (number | null)[][] = perRunValues.map((values) =>
    xIndices.map((i) => (i < values.length ? values[i] : null))
  )

  const series: uPlot.Series[] = [
    {},
    ...runsWithMetrics.map(({ run, color }) => ({
      label: run.name || run.id,
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
  runsWithMetrics: { run: RunSummary; color: string; metrics: MetricPoint[] }[]
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
      if (width && plotRef.current) {
        plotRef.current.setSize({ width, height: 240 })
      }
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
    if (plotRef.current) {
      plotRef.current.setData(data)
    }
  }, [data])

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-surface)] card-elevated">
      <div ref={wrapperRef} className="w-full" />
    </div>
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

  const runsWithColor: RunWithColor[] = useMemo(() => {
    if (!projectRuns) return []
    return projectRuns.map((run, i) => ({ run, color: colorForIndex(i) }))
  }, [projectRuns])

  const visibleRunsWithColor = runsWithColor.filter(({ run }) => visibleRunIds.has(run.id))

  // fetch metrics for every VISIBLE run in parallel
  const metricsQueries = useQueries({
    queries: visibleRunsWithColor.map(({ run }) => ({
      queryKey: ['workspace-metrics', run.id],
      queryFn: () => fetchMetrics(run.id),
      refetchInterval: 3000,
    })),
  })

  const runsWithMetrics = useMemo(() => {
    return visibleRunsWithColor.map((rc, i) => ({
      ...rc,
      metrics: metricsQueries[i]?.data ?? [],
    }))
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
          })}
        </div>
      </div>

      <div className="flex-1 py-8 min-w-0">
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-4">
          {visibleRunIds.size} run{visibleRunIds.size !== 1 ? 's' : ''} selected
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
