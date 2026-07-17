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
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const steps = points.map((p) => p.step)
    const values = points.map((p) => p.value)
    const data: uPlot.AlignedData = [steps, values]

    if (!plotRef.current) {
      const opts: uPlot.Options = {
        width: 560,
        height: 220,
        title: metricKey,
        scales: { x: { time: false } },
        series: [
          { label: 'step' },
          { label: metricKey, stroke: '#22d3ee', width: 2 },
        ],
        axes: [
          { stroke: '#71717a', grid: { stroke: '#27272a' } },
          { stroke: '#71717a', grid: { stroke: '#27272a' } },
        ],
      }
      plotRef.current = new uPlot(opts, data, containerRef.current)
    } else {
      plotRef.current.setData(data)
    }

    return () => {
      // keep plot alive across re-renders; only destroy on unmount
    }
  }, [points, metricKey])

  useEffect(() => {
    return () => {
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="bg-zinc-900 rounded-lg p-3" />
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
        className="text-zinc-400 hover:text-zinc-100 text-sm mb-4"
      >
        ← back to runs
      </button>
      <h2 className="text-lg font-semibold mb-4 font-mono">{runId}</h2>

      {isLoading && <p className="text-zinc-500">Loading metrics…</p>}

      <div className="grid grid-cols-2 gap-4">
        {Object.entries(grouped).map(([key, points]) => (
          <MetricChart key={key} metricKey={key} points={points} />
        ))}
      </div>
    </div>
  )
}