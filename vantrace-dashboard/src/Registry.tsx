import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

const SERVER_URL = 'http://localhost:6789'

interface RunSummary {
  id: string
  project: string
  name: string
  started_at: number
  finished_at: number | null
}

interface RegistryEntry {
  tag: string
  hash: string
  filename: string
  size: number
  updated_at: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function fetchRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${SERVER_URL}/runs`)
  if (!res.ok) throw new Error('Failed to fetch runs')
  return res.json()
}

async function fetchRegistry(project: string): Promise<RegistryEntry[]> {
  const res = await fetch(`${SERVER_URL}/projects/${project}/registry`)
  if (!res.ok) throw new Error('Failed to fetch registry')
  return res.json()
}

export function Registry() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  const { data: runs } = useQuery({ queryKey: ['runs'], queryFn: fetchRuns })

  const projects = useMemo(() => {
    if (!runs) return []
    return Array.from(new Set(runs.map((r) => r.project))).sort()
  }, [runs])

  const activeProject = selectedProject ?? projects[0] ?? null

  const { data: registry, isLoading } = useQuery({
    queryKey: ['registry', activeProject],
    queryFn: () => fetchRegistry(activeProject!),
    enabled: !!activeProject,
  })

  if (projects.length === 0) {
    return (
      <p className="text-[var(--color-muted)] text-sm">
        No projects yet — log a run first.
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <label className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
          Project
        </label>
        <select
          value={activeProject ?? ''}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-3 py-1.5 text-sm text-[var(--color-ink)]"
        >
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-[var(--color-muted)] text-sm">Loading registry…</p>}

      {registry && registry.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
          <p className="text-[var(--color-muted)] text-sm">
            No tagged models yet for <span className="font-mono">{activeProject}</span>.
            Promote one with{' '}
            <code className="font-mono">
              POST /projects/{'{project}'}/registry
            </code>
            .
          </p>
        </div>
      )}

      {registry && registry.length > 0 && (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--color-muted)] text-xs uppercase tracking-wide border-b border-[var(--color-border)]">
                <th className="py-2.5 px-4 font-medium">Tag</th>
                <th className="py-2.5 px-4 font-medium">File</th>
                <th className="py-2.5 px-4 font-medium">Size</th>
                <th className="py-2.5 px-4 font-medium">Hash</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {registry.map((entry) => (
                <tr
                  key={entry.tag}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="py-2.5 px-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
                      {entry.tag}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[var(--color-ink)]">
                    {entry.filename}
                  </td>
                  <td className="py-2.5 px-4 text-[var(--color-muted)] font-mono text-xs">
                    {formatBytes(entry.size)}
                  </td>
                  <td className="py-2.5 px-4 text-[var(--color-muted)] font-mono text-xs">
                    {entry.hash.slice(0, 8)}
                  </td>
                  <td className="py-2.5 px-4">
                    
                    <a  href={`${SERVER_URL}/artifacts/${entry.hash}`}
                      download={entry.filename}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink)] bg-[var(--color-base)] border border-[var(--color-border)] rounded-md px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
