import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import uPlot from 'uplot'

const SERVER_URL = 'http://localhost:6789'

interface MetricPoint {
  step: number
  key: string
  value: number
}

async function fetchMetrics(runId: string): Promise<MetricPoint[]> {
  const res = await fetch(`${SERVER_URL}/runs/${runId}/metrics`)
  if (!res.ok) throw new Error('Failed to fetch metrics')
  return res.json()
}

function groupByKey(points: MetricPoint[]): Record<string, MetricPoint[]> {
  const groups: Record<string, MetricPoint[]> = {}
  for (const p of points) {
    if (!groups[p.key]) groups[p.key] = []
    groups[p.key].push(p)
  }
  return groups
}

function MetricChart({ metricKey, points }: { metricKey: string; points: MetricPoint[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  // create once
  useEffect(() => {
    if (!wrapperRef.current) return

    const opts: uPlot.Options = {
      width: wrapperRef.current.clientWidth,
      height: 200,
      title: metricKey,
      scales: { x: { time: false } },
      series: [
        { label: 'step' },
        { label: metricKey, stroke: '#f0a23c', width: 2 },
      ],
      axes: [
        { stroke: '#8b8b93', grid: { stroke: '#27272c' } },
        { stroke: '#8b8b93', grid: { stroke: '#27272c' } },
      ],
    }
    plotRef.current = new uPlot(opts, [[], []], wrapperRef.current)

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width && plotRef.current) {
        plotRef.current.setSize({ width, height: 200 })
      }
    })
    observer.observe(wrapperRef.current)

    return () => {
      observer.disconnect()
      plotRef.current?.destroy()
      plotRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKey])

  // update data
  useEffect(() => {
    if (!plotRef.current) return
    const steps = points.map((p) => p.step)
    const values = points.map((p) => p.value)
    plotRef.current.setData([steps, values])
  }, [points])

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-surface)]">
      <p className="text-xs font-mono text-[var(--color-muted)] mb-2 uppercase tracking-wide">
        {metricKey}
      </p>
      <div ref={wrapperRef} className="w-full" />
    </div>
  )
}

export function RunDetail({ runId, onBack }: { runId: string; onBack: () => void }) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics', runId],
    queryFn: () => fetchMetrics(runId),
    refetchInterval: 2000,
  })

  const grouped = metrics ? groupByKey(metrics) : {}

  return (
    <div>
      <button
        onClick={onBack}
        className="text-[var(--color-muted)] hover:text-[var(--color-ink)] text-sm mb-5 transition-colors"
      >
        ← back to runs
      </button>
      <h2 className="text-base font-mono text-[var(--color-ink)] mb-6">{runId}</h2>

      {isLoading && <p className="text-[var(--color-muted)] text-sm">Loading metrics…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(grouped).map(([key, points]) => (
          <MetricChart key={key} metricKey={key} points={points} />
        ))}
      </div>
    </div>
  )
}