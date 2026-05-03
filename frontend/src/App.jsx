import { useState } from 'react'
import { parseData, clusterData } from './api/client'
import { clusterColor, groupHashColor } from './utils/colors'
import ClusterChart from './components/ClusterChart'
import ClusterConfig from './components/ClusterConfig'
import ColumnSelector from './components/ColumnSelector'
import DataInput from './components/DataInput'
import ResultsTable from './components/ResultsTable'

const STEPS = ['Ingest', 'Configure', 'Results']

export default function App() {
  const [step, setStep] = useState(0)
  const [rawData, setRawData] = useState(null)
  const [schema, setSchema] = useState(null)
  const [selectedColumns, setSelectedColumns] = useState([])
  const [groupByField, setGroupByField] = useState(null)
  const [weights, setWeights] = useState({})
  const [config, setConfig] = useState({
    algorithm: 'kmeans',
    n_clusters: 3,
    eps: 0.5,
    min_samples: 5,
  })
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleDataParsed = async (data) => {
    setLoading(true)
    setError(null)
    try {
      const schemaResult = await parseData(data)
      const numericCols = schemaResult.columns
        .filter((c) => c.dtype === 'numeric')
        .map((c) => c.name)
      setRawData(data)
      setSchema(schemaResult)
      setSelectedColumns(numericCols)
      setWeights(Object.fromEntries(numericCols.map((c) => [c, 1.0])))
      setGroupByField(null)
      setStep(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectionChange = (cols) => {
    setSelectedColumns(cols)
    setWeights((prev) => {
      const next = {}
      cols.forEach((c) => { next[c] = prev[c] ?? 1.0 })
      return next
    })
  }

  const handleWeightChange = (col, value) => {
    setWeights((prev) => ({ ...prev, [col]: value }))
  }

  const handleRunClustering = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await clusterData({
        data: rawData,
        columns: selectedColumns,
        group_by: groupByField || undefined,
        weights,
        ...config,
      })
      setResults(result)
      setStep(2)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setStep(0)
    setRawData(null)
    setSchema(null)
    setSelectedColumns([])
    setGroupByField(null)
    setWeights({})
    setResults(null)
    setError(null)
  }

  // For ClusterConfig: cardinality of group-by field
  const groupByCardinality = groupByField && schema
    ? schema.columns.find((c) => c.name === groupByField)?.cardinality ?? null
    : null

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Cluster<span className="text-indigo-400">US</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  i === step ? 'bg-indigo-600 text-white'
                  : i < step ? 'text-indigo-400'
                  : 'text-slate-500'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i < step ? 'bg-indigo-500 text-white'
                    : i === step ? 'bg-white text-indigo-600'
                    : 'bg-slate-800 text-slate-500'
                  }`}>
                    {i < step ? '✓' : i + 1}
                  </span>
                  {s}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-px ${i < step ? 'bg-indigo-500' : 'bg-slate-700'}`} />
                )}
              </div>
            ))}
          </nav>

          {step > 0 && (
            <button onClick={handleReset} className="btn-secondary text-sm py-1.5 px-3">
              New Session
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 bg-red-900/30 border border-red-800 text-red-300 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        )}

        {step === 0 && <DataInput onDataParsed={handleDataParsed} loading={loading} />}

        {step === 1 && schema && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ColumnSelector
                schema={schema}
                selectedColumns={selectedColumns}
                groupByField={groupByField}
                weights={weights}
                onSelectionChange={handleSelectionChange}
                onGroupByChange={setGroupByField}
                onWeightChange={handleWeightChange}
              />
            </div>
            <div>
              <ClusterConfig
                config={config}
                onConfigChange={setConfig}
                selectedCount={selectedColumns.length}
                groupByField={groupByField}
                groupByCardinality={groupByCardinality}
                weights={weights}
                onRun={handleRunClustering}
                loading={loading}
              />
            </div>
          </div>
        )}

        {step === 2 && results && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Clusters Found" value={results.n_clusters_found} />
              <StatCard label="Data Points" value={rawData ? countRecords(rawData).toLocaleString() : '—'} />
              <StatCard label="Features Used" value={selectedColumns.length} />
              {results.inertia != null ? (
                <StatCard label="Inertia" value={results.inertia.toFixed(1)} />
              ) : (
                <StatCard label="Noise Points" value={results.cluster_counts['-1'] ?? 0} />
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ClusterChart results={results} />
              <ClusterDistribution results={results} />
            </div>

            <ResultsTable points={results.points} />

            <div className="flex justify-center pb-6">
              <button onClick={() => setStep(1)} className="btn-secondary">
                ← Back to Configuration
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function countRecords(data) {
  if (Array.isArray(data)) return data.length
  let max = 0
  const walk = (obj) => {
    if (Array.isArray(obj)) { if (obj.length > max) max = obj.length; return }
    if (obj && typeof obj === 'object') Object.values(obj).forEach(walk)
  }
  walk(data)
  return max
}

function StatCard({ label, value }) {
  return (
    <div className="card">
      <p className="text-slate-400 text-sm">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  )
}

function ClusterDistribution({ results }) {
  const { labels, cluster_counts, group_cluster_map, group_by_field } = results
  const total = labels.length

  if (group_cluster_map) {
    // Build hierarchy: group → [{ globalId, local, count }]
    const byGroup = {}
    Object.entries(group_cluster_map).forEach(([gid, info]) => {
      const g = info.group
      if (!byGroup[g]) byGroup[g] = []
      byGroup[g].push({ gid, local: info.local, count: cluster_counts[gid] ?? 0 })
    })

    return (
      <div className="card">
        <h3 className="text-slate-300 font-semibold mb-1">
          Cluster Distribution
        </h3>
        {group_by_field && (
          <p className="text-xs text-cyan-500 mb-4">
            Agrupado por <span className="font-mono">{group_by_field.split('.').pop()}</span>
            {' · '}{Object.keys(byGroup).length} grupos
          </p>
        )}
        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {Object.entries(byGroup)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([groupName, clusters]) => {
              const groupTotal = clusters.reduce((s, c) => s + c.count, 0)
              const groupPct = ((groupTotal / total) * 100).toFixed(1)
              const color = groupHashColor(groupName)
              return (
                <div key={groupName}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-sm font-semibold" style={{ color }}>{groupName}</span>
                    <span className="text-xs text-slate-500">
                      {groupTotal.toLocaleString()} · {groupPct}%
                    </span>
                  </div>
                  <div className="pl-3 border-l-2 space-y-1.5" style={{ borderColor: color + '50' }}>
                    {clusters
                      .sort((a, b) => a.local - b.local)
                      .map(({ gid, local, count }) => {
                        const pct = ((count / total) * 100).toFixed(1)
                        return (
                          <div key={gid}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-slate-500">Cluster {local}</span>
                              <span className="text-slate-600">{count.toLocaleString()} · {pct}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${((count / groupTotal) * 100).toFixed(1)}%`, backgroundColor: color + 'b0' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    )
  }

  // Standard flat distribution
  return (
    <div className="card">
      <h3 className="text-slate-300 font-semibold mb-4">Cluster Distribution</h3>
      <div className="space-y-3">
        {Object.entries(cluster_counts)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .map(([cluster, count]) => {
            const pct = ((count / total) * 100).toFixed(1)
            const color = clusterColor(cluster)
            return (
              <div key={cluster}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium" style={{ color }}>
                    {cluster === '-1' ? 'Noise' : `Cluster ${cluster}`}
                  </span>
                  <span className="text-slate-400">{count.toLocaleString()} pts · {pct}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
