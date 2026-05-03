import { useMemo } from 'react'
import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
import { clusterColor } from '../utils/colors'

const Plot = createPlotlyComponent(Plotly)

const DARK = {
  paper: '#0f172a',
  plot: '#0f172a',
  grid: '#1e293b',
  zeroline: '#334155',
  font: '#94a3b8',
}

export default function ClusterChart({ results }) {
  const { pca_coords, labels, pca_variance_explained } = results
  const is3D = pca_coords?.[0]?.z !== undefined

  const traces = useMemo(() => {
    if (!pca_coords) return []

    const groups = {}
    labels.forEach((label, i) => {
      if (!groups[label]) groups[label] = []
      groups[label].push(i)
    })

    return Object.entries(groups)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([label, indices]) => {
        const isNoise = label === '-1'
        const color = clusterColor(label)
        const name = isNoise ? 'Noise' : `Cluster ${label}`
        const xs = indices.map((i) => pca_coords[i].x)
        const ys = indices.map((i) => pca_coords[i].y)

        if (is3D) {
          const zs = indices.map((i) => pca_coords[i].z)
          return {
            type: 'scatter3d',
            mode: 'markers',
            name,
            x: xs,
            y: ys,
            z: zs,
            marker: { size: 4, color, opacity: 0.85 },
          }
        }

        return {
          type: 'scatter',
          mode: 'markers',
          name,
          x: xs,
          y: ys,
          marker: {
            size: 8,
            color,
            opacity: 0.8,
            line: { width: 1, color: DARK.plot },
          },
          hovertemplate: `<b>${name}</b><br>PC1: %{x:.3f}<br>PC2: %{y:.3f}<extra></extra>`,
        }
      })
  }, [pca_coords, labels, is3D])

  const axisStyle = {
    gridcolor: DARK.grid,
    zerolinecolor: DARK.zeroline,
    color: DARK.font,
    tickfont: { color: DARK.font, size: 11 },
  }

  const layout = {
    paper_bgcolor: DARK.paper,
    plot_bgcolor: DARK.plot,
    font: { color: DARK.font, family: 'Inter, system-ui, sans-serif', size: 12 },
    legend: {
      bgcolor: 'rgba(15,23,42,0.9)',
      bordercolor: '#334155',
      borderwidth: 1,
      font: { color: '#cbd5e1' },
    },
    margin: { t: 20, r: 20, b: 50, l: 50 },
    xaxis: { ...axisStyle, title: { text: 'PC 1', font: { color: '#64748b' } } },
    yaxis: { ...axisStyle, title: { text: 'PC 2', font: { color: '#64748b' } } },
    autosize: true,
    hoverlabel: {
      bgcolor: '#1e293b',
      bordercolor: '#475569',
      font: { color: '#e2e8f0' },
    },
  }

  if (is3D) {
    layout.scene = {
      xaxis: { ...axisStyle, title: 'PC 1' },
      yaxis: { ...axisStyle, title: 'PC 2' },
      zaxis: { ...axisStyle, title: 'PC 3' },
      bgcolor: DARK.plot,
    }
    delete layout.xaxis
    delete layout.yaxis
    delete layout.margin
    layout.margin = { t: 20, r: 0, b: 0, l: 0 }
  }

  if (!pca_coords) {
    return (
      <div className="card flex items-center justify-center h-64">
        <p className="text-slate-500">Chart unavailable — no PCA coordinates returned</p>
      </div>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h3 className="text-slate-300 font-semibold">
          Cluster Visualization{' '}
          <span className="text-slate-500 font-normal text-sm">
            ({is3D ? '3D' : '2D'} PCA projection)
          </span>
        </h3>
        {pca_variance_explained != null && (
          <span className="text-xs bg-slate-800 border border-slate-700 text-slate-400 px-2.5 py-1 rounded-full">
            {(pca_variance_explained * 100).toFixed(1)}% variance explained
          </span>
        )}
      </div>
      <Plot
        data={traces}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        }}
        style={{ width: '100%', height: '380px' }}
        useResizeHandler
      />
    </div>
  )
}
