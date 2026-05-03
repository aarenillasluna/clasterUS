export default function ClusterConfig({
  config,
  onConfigChange,
  selectedCount,
  selectedCategoricalCount,
  weights,
  onRun,
  loading,
}) {
  const set = (key, value) => onConfigChange({ ...config, [key]: value })

  const customWeights = Object.values(weights ?? {}).filter((w) => Math.abs(w - 1.0) > 0.05)
  const totalSelected = selectedCount + (selectedCategoricalCount ?? 0)

  return (
    <div className="card sticky top-24">
      <h2 className="text-lg font-semibold text-white mb-6">Model Configuration</h2>

      {/* Algorithm */}
      <div className="mb-6">
        <FieldLabel>Algorithm</FieldLabel>
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg mt-2">
          {['kmeans', 'dbscan'].map((alg) => (
            <button
              key={alg}
              onClick={() => set('algorithm', alg)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                config.algorithm === alg
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {alg === 'kmeans' ? 'K-Means' : 'DBSCAN'}
            </button>
          ))}
        </div>
      </div>

      {config.algorithm === 'kmeans' && (
        <div className="mb-6">
          <FieldLabel>
            Clusters{' '}
            <span className="text-indigo-400 font-bold normal-case">k = {config.n_clusters}</span>
          </FieldLabel>
          <input
            type="range"
            min={2}
            max={50}
            value={Math.min(config.n_clusters, 50)}
            onChange={(e) => set('n_clusters', parseInt(e.target.value))}
            className="w-full mt-3 accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>2</span>
            <span>50</span>
          </div>

          {/* Quick picks */}
          <div className="mt-3 grid grid-cols-5 gap-1">
            {[3, 5, 8, 10, 15].map((k) => (
              <button
                key={k}
                onClick={() => set('n_clusters', k)}
                className={`py-1 text-xs rounded font-medium transition-colors ${
                  config.n_clusters === k
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Free input for any k */}
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs text-slate-500 shrink-0">Custom k:</label>
            <input
              type="number"
              min={2}
              max={200}
              value={config.n_clusters}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v) && v >= 2) set('n_clusters', v)
              }}
              className="input-field w-full py-1.5 text-sm"
            />
          </div>
        </div>
      )}

      {config.algorithm === 'dbscan' && (
        <div className="space-y-4 mb-6">
          <div>
            <FieldLabel>Epsilon (ε)</FieldLabel>
            <input
              type="number"
              min={0.01}
              step={0.05}
              value={config.eps}
              onChange={(e) => set('eps', parseFloat(e.target.value))}
              className="input-field w-full mt-2"
            />
            <p className="text-xs text-slate-500 mt-1">Smaller → tighter clusters, more noise</p>
          </div>
          <div>
            <FieldLabel>Min Samples</FieldLabel>
            <input
              type="number"
              min={1}
              step={1}
              value={config.min_samples}
              onChange={(e) => set('min_samples', parseInt(e.target.value))}
              className="input-field w-full mt-2"
            />
          </div>
        </div>
      )}

      {/* Weights / categorical summary */}
      {(customWeights.length > 0 || (selectedCategoricalCount ?? 0) > 0) && (
        <div className="mb-4 space-y-2">
          {customWeights.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-3">
              <p className="text-xs text-amber-400 font-medium">
                {customWeights.length} feature{customWeights.length > 1 ? 's' : ''} with custom weight
              </p>
            </div>
          )}
          {(selectedCategoricalCount ?? 0) > 0 && (
            <div className="bg-violet-900/20 border border-violet-800/40 rounded-lg p-3">
              <p className="text-xs text-violet-400 font-medium">
                {selectedCategoricalCount} categorical field{selectedCategoricalCount > 1 ? 's' : ''} will be one-hot encoded
              </p>
            </div>
          )}
        </div>
      )}

      <div className="pt-5 border-t border-slate-800">
        <p className="text-sm text-slate-400 mb-4">
          <span className="font-semibold text-slate-200">{selectedCount}</span> numeric
          {(selectedCategoricalCount ?? 0) > 0 && (
            <> + <span className="font-semibold text-violet-400">{selectedCategoricalCount}</span> categorical</>
          )}{' '}
          feature{totalSelected !== 1 ? 's' : ''} selected
        </p>
        <button
          onClick={onRun}
          disabled={totalSelected === 0 || loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Spinner />
              Running…
            </>
          ) : (
            'Run Clustering →'
          )}
        </button>
        {totalSelected === 0 && (
          <p className="text-xs text-amber-500 text-center mt-2">
            Select at least one feature first
          </p>
        )}
      </div>
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {children}
    </label>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
