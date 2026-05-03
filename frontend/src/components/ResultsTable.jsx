import { useState } from 'react'
import { clusterColor } from '../utils/colors'

const PAGE_SIZE = 25

export default function ResultsTable({ points }) {
  const [page, setPage] = useState(0)
  const [sortCol, setSortCol] = useState('_cluster')
  const [sortDir, setSortDir] = useState('asc')

  if (!points?.length) return null

  const allCols = Object.keys(points[0])
  const displayCols = ['_cluster', ...allCols.filter((c) => c !== '_cluster')]

  const sorted = [...points].sort((a, b) => {
    const va = a[sortCol]
    const vb = b[sortCol]
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setPage(0)
  }

  const exportCSV = () => {
    const header = displayCols.map((c) => (c === '_cluster' ? 'cluster' : c)).join(',')
    const rows = points.map((p) =>
      displayCols
        .map((c) => {
          const v = p[c]
          if (v == null) return ''
          const s = String(v)
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cluster_results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h3 className="text-slate-300 font-semibold">Results Table</h3>
        <div className="flex items-center gap-4">
          <span className="text-slate-500 text-sm">{points.length.toLocaleString()} rows</span>
          <button onClick={exportCSV} className="btn-secondary text-sm py-1.5 px-3">
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/40">
              {displayCols.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="text-left py-3 px-4 text-slate-400 font-medium cursor-pointer hover:text-slate-200 whitespace-nowrap select-none transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    {col === '_cluster' ? 'Cluster' : col}
                    {sortCol === col && (
                      <span className="text-indigo-400 text-xs">
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, i) => {
              const cluster = row._cluster
              const color = clusterColor(cluster)
              const isNoise = cluster === -1
              return (
                <tr
                  key={i}
                  className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                >
                  {displayCols.map((col) => (
                    <td key={col} className="py-2.5 px-4 text-slate-300">
                      {col === '_cluster' ? (
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
                        >
                          {isNoise ? 'Noise' : `C ${cluster}`}
                        </span>
                      ) : (
                        <span className="font-mono text-xs">{formatVal(row[col])}</span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800">
          <span className="text-slate-500 text-sm">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatVal(v) {
  if (v == null) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4)
  return String(v)
}
