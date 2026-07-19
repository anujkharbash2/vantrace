import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import uPlot from 'uplot'

const SERVER_URL = 'http://localhost:6789'

interface Artifact {
  hash: string
  filename: string
  size: number
  content_type: string
  role: string
}

async function fetchArtifacts(runId: string): Promise<Artifact[]> {
  const res = await fetch(`${SERVER_URL}/runs/${runId}/artifacts`)
  if (!res.ok) throw new Error('Failed to fetch artifacts')
  return res.json()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
        { label: metricKey, stroke: '#c2410c', width: 2 },
      ],
      axes: [
        { stroke: '#8a877d', grid: { stroke: '#ece9df' } },
        { stroke: '#8a877d', grid: { stroke: '#ece9df' } },
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
function ArtifactList({ runId }: { runId: string }) {
  const { data: artifacts, isLoading } = useQuery({
    queryKey: ['artifacts', runId],
    queryFn: () => fetchArtifacts(runId),
  })

  if (isLoading) {
    return <p className="text-[var(--color-muted)] text-sm">Loading artifacts…</p>
  }

  if (!artifacts || artifacts.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-lg p-6 text-center">
        <p className="text-[var(--color-muted)] text-sm">
          No artifacts logged. Attach one with{' '}
          <code className="font-mono">vantrace.log_artifact()</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--color-muted)] text-xs uppercase tracking-wide border-b border-[var(--color-border)]">
            <th className="py-2.5 px-4 font-medium">File</th>
            <th className="py-2.5 px-4 font-medium">Role</th>
            <th className="py-2.5 px-4 font-medium">Size</th>
            <th className="py-2.5 px-4 font-medium">Hash</th>
            <th className="py-2.5 px-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {artifacts.map((a) => (
            <tr
              key={a.hash}
              className="border-b border-[var(--color-border)] last:border-0"
            >
              <td className="py-2.5 px-4 font-mono text-[var(--color-ink)]">{a.filename}</td>
              <td className="py-2.5 px-4 text-[var(--color-muted)]">{a.role}</td>
              <td className="py-2.5 px-4 text-[var(--color-muted)] font-mono text-xs">
                {formatBytes(a.size)}
              </td>
              <td className="py-2.5 px-4 text-[var(--color-muted)] font-mono text-xs">
                {a.hash.slice(0, 8)}
              </td>
              <td className="py-2.5 px-4">
                <a
                  href={`${SERVER_URL}/artifacts/${a.hash}`}
                  download={a.filename}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink)] bg-[var(--color-base)] border border-[var(--color-border)] rounded-md px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {Object.entries(grouped).map(([key, points]) => (
          <MetricChart key={key} metricKey={key} points={points} />
        ))}
      </div>

      <h3 className="text-xs uppercase tracking-wide text-[var(--color-muted)] mb-3">
        Artifacts
      </h3>
      <ArtifactList runId={runId} />
    </div>
  )
}