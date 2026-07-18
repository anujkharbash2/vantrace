import { useQuery } from '@tanstack/react-query'

const SERVER_URL = 'http://localhost:6789'

interface LineageEntry {
  run_id: string
  project: string
  role: string
  logged_at: number
}

async function fetchLineage(hash: string): Promise<LineageEntry[]> {
  const res = await fetch(`${SERVER_URL}/artifacts/${hash}/lineage`)
  if (!res.ok) throw new Error('Failed to fetch lineage')
  return res.json()
}

export function LineagePanel({ hash, onClose }: { hash: string; onClose: () => void }) {
  const { data: lineage, isLoading } = useQuery({
    queryKey: ['lineage', hash],
    queryFn: () => fetchLineage(hash),
  })

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-surface)] mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
          Lineage — {hash.slice(0, 8)}
        </p>
        <button
          onClick={onClose}
          className="text-[var(--color-muted)] hover:text-[var(--color-ink)] text-xs"
        >
          close
        </button>
      </div>

      {isLoading && <p className="text-[var(--color-muted)] text-sm">Loading…</p>}

      {lineage && lineage.length === 0 && (
        <p className="text-[var(--color-muted)] text-sm">No linked runs found.</p>
      )}

      {lineage && lineage.length > 0 && (
        <div className="space-y-2">
          {lineage.map((entry, i) => (
            <div
              key={i}
              className="flex items-center gap-3 text-sm border-b border-[var(--color-border)] last:border-0 pb-2 last:pb-0"
            >
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  entry.role === 'output'
                    ? 'bg-[var(--color-good)]/15 text-[var(--color-good)]'
                    : 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                }`}
              >
                {entry.role === 'output' ? 'produced by' : 'used by'}
              </span>
              <span className="font-mono text-[var(--color-ink)]">{entry.run_id}</span>
              <span className="text-[var(--color-muted)]">({entry.project})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}