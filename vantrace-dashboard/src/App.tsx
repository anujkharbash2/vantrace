import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RunDetail } from './RunDetail'
import { Registry } from './Registry'
import { Leaderboard } from './Leaderboard'
import { Workspace } from './Workspace'
import { RunsTable } from './RunsTable'

const SERVER_URL = 'http://localhost:6789'

interface RunSummary {
  id: string
  project: string
  name: string
  config: Record<string, unknown>
  started_at: number
  finished_at: number | null
}

async function fetchAllRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${SERVER_URL}/runs`)
  if (!res.ok) throw new Error('Failed to fetch runs')
  return res.json()
}

type Tab = 'workspace' | 'runs' | 'registry' | 'leaderboard'

const NAV_ITEMS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />
      </svg>
    ),
  },
  {
    id: 'runs',
    label: 'Runs',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    ),
  },
  {
    id: 'registry',
    label: 'Registry',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 3 7v10l9 5 9-5V7z" />
        <path d="M3 7l9 5 9-5M12 12v10" />
      </svg>
    ),
  },
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
        <path d="M7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4" />
      </svg>
    ),
  },
]

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('workspace')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  const { data: allRuns, error } = useQuery({
    queryKey: ['runs'],
    queryFn: fetchAllRuns,
    refetchInterval: 3000,
  })

  const projects = useMemo(() => {
    if (!allRuns) return []
    return Array.from(new Set(allRuns.map((r) => r.project))).sort()
  }, [allRuns])

  const activeProject = selectedProject ?? projects[0] ?? null

  function goToRun(id: string) {
    setSelectedRunId(id)
  }

  function renderMain() {
    if (selectedRunId) {
      return <RunDetail runId={selectedRunId} onBack={() => setSelectedRunId(null)} />
    }
    if (error) {
      return (
        <div className="border border-[var(--color-border)] rounded-lg p-6 text-sm max-w-md">
          <p className="text-red-700 font-medium mb-1">Can't reach the server</p>
          <p className="text-[var(--color-muted)]">
            No response from {SERVER_URL}. Start it with{' '}
            <code className="font-mono bg-[var(--color-surface)] px-1.5 py-0.5 rounded">go run .</code>{' '}
            inside vantrace-server.
          </p>
        </div>
      )
    }
    if (!activeProject) {
      return (
        <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center max-w-md">
          <p className="text-[var(--color-muted)] text-sm">
            No runs yet. Log one with <code className="font-mono">vantrace.init()</code>.
          </p>
        </div>
      )
    }
    switch (activeTab) {
      case 'workspace':
        return <Workspace project={activeProject} />
      case 'runs':
        return <RunsTable project={activeProject} onSelectRun={goToRun} />
      case 'registry':
        return <Registry project={activeProject} />
      case 'leaderboard':
        return <Leaderboard project={activeProject} />
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left nav rail */}
      <aside className="w-56 shrink-0 border-r border-[var(--color-border)] flex flex-col h-screen sticky top-0">
        <div className="px-5 py-5">
          <h1 className="text-lg font-semibold tracking-tight">vantrace</h1>
          <div className="h-px w-12 mt-2 bg-gradient-to-r from-[var(--color-accent)] to-transparent" />
        </div>

        <div className="px-5 mb-4">
          <label className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] block mb-1.5">
            Project
          </label>
          <select
            value={activeProject ?? ''}
            onChange={(e) => { setSelectedProject(e.target.value); setSelectedRunId(null) }}
            disabled={projects.length === 0}
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--color-ink)] disabled:opacity-40"
          >
            {projects.length === 0 && <option>—</option>}
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <nav className="px-3 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSelectedRunId(null) }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                activeTab === item.id && !selectedRunId
                  ? 'bg-[var(--color-surface)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)]/50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-5 py-4 text-[10px] text-[var(--color-muted)]">
          local-first · v0.3.1
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-8 py-8 sm:px-10 overflow-x-auto">
        {renderMain()}
      </main>
    </div>
  )
}

export default App
