import { useQuery } from '@tanstack/react-query'

const SERVER_URL = 'http://localhost:6789'

interface RunSummary {
  id: string
  project: string
  name: string
  started_at: number
  finished_at: number | null
}

function formatDuration(started: number, finished: number | null): string {
  const end = finished ?? Date.now() / 1000
  const secs = Math.round(end - started)
  return `${secs}s`
}

async function fetchRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${SERVER_URL}/runs`)
  if (!res.ok) throw new Error('Failed to fetch runs')
  return res.json()
}

function App() {
  const { data: runs, isLoading, error } = useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    refetchInterval: 2000, // poll every 2s for "live" feel
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <h1 className="text-2xl font-semibold mb-1">Vantrace</h1>
      <p className="text-zinc-400 text-sm mb-6">Local experiment tracking</p>

      {isLoading && <p className="text-zinc-500">Loading runs…</p>}
      {error && (
        <p className="text-red-400">
          Couldn't reach server at {SERVER_URL}. Is vantrace-server running?
        </p>
      )}

      {runs && runs.length === 0 && (
        <p className="text-zinc-500">No runs yet. Log one with vantrace.init().</p>
      )}

      {runs && runs.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-zinc-800">
              <th className="py-2 pr-4">Project</th>
              <th className="py-2 pr-4">Run</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                <td className="py-2 pr-4">{run.project}</td>
                <td className="py-2 pr-4 font-mono text-zinc-300">
                  {run.name || run.id}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      run.finished_at
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    }
                  >
                    {run.finished_at ? 'finished' : 'running'}
                  </span>
                </td>
                <td className="py-2 pr-4 text-zinc-400">
                  {formatDuration(run.started_at, run.finished_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default App