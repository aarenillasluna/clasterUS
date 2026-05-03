const COVERAGE_THRESHOLDS = { high: 0.99, mid: 0.5 }
const MAX_ENCODABLE_CARDINALITY = 50

function coverageLabel(c) {
  if (c >= COVERAGE_THRESHOLDS.high) return { label: '100%', cls: 'bg-emerald-900/50 text-emerald-400 border-emerald-800/50' }
  if (c >= COVERAGE_THRESHOLDS.mid) return { label: `${Math.round(c * 100)}%`, cls: 'bg-amber-900/50 text-amber-400 border-amber-800/50' }
  return { label: `${Math.round(c * 100)}%`, cls: 'bg-red-900/40 text-red-400 border-red-800/50' }
}

function shortName(name) {
  const parts = name.split('.')
  return parts.length > 2 ? parts.slice(-2).join('.') : name
}

export default function ColumnSelector({
  schema,
  selectedColumns,
  selectedCategoricalColumns,
  weights,
  onSelectionChange,
  onCategoricalSelectionChange,
  onWeightChange,
}) {
  // Build recommendation map from schema
  const recMap = Object.fromEntries(
    schema.columns.map((c) => [c.name, c.recommended_weight ?? 1.0])
  )

  const toggle = (name) => {
    onSelectionChange(
      selectedColumns.includes(name)
        ? selectedColumns.filter((c) => c !== name)
        : [...selectedColumns, name],
    )
  }

  const toggleCat = (name) => {
    onCategoricalSelectionChange(
      selectedCategoricalColumns.includes(name)
        ? selectedCategoricalColumns.filter((c) => c !== name)
        : [...selectedCategoricalColumns, name],
    )
  }

  const applyRecommendations = () => {
    const allSelected = [...selectedColumns, ...selectedCategoricalColumns]
    allSelected.forEach((col) => {
      onWeightChange(col, recMap[col] ?? 1.0)
    })
  }

  const numericCols = schema.columns.filter((c) => c.dtype === 'numeric')
  const categoricalCols = schema.columns.filter((c) => c.dtype === 'categorical')
  const encodableCols = categoricalCols.filter((c) => (c.cardinality ?? 999) <= MAX_ENCODABLE_CARDINALITY)
  const highCardinalityCols = categoricalCols.filter((c) => (c.cardinality ?? 999) > MAX_ENCODABLE_CARDINALITY)

  const commonNumeric = numericCols.filter((c) => c.coverage >= COVERAGE_THRESHOLDS.high)
  const partialNumeric = numericCols.filter((c) => c.coverage < COVERAGE_THRESHOLDS.high)

  const allSelected = [...selectedColumns, ...selectedCategoricalColumns]
  const hasCustomWeights = allSelected.some((col) => Math.abs((weights[col] ?? 1.0) - (recMap[col] ?? 1.0)) > 0.05)
  const allMatchRec = allSelected.length > 0 && !hasCustomWeights

  return (
    <div className="space-y-4">
      <div className="card">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold text-white">Feature Selection</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              {schema.row_count.toLocaleString()} records · {schema.columns.length} fields detected
              {schema.detected_path && schema.detected_path !== 'root' && (
                <span className="ml-2 text-indigo-400 font-mono text-xs">↳ {schema.detected_path}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm shrink-0">
            <button
              onClick={() => onSelectionChange(numericCols.map((c) => c.name))}
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              All Numeric
            </button>
            <span className="text-slate-700">·</span>
            <button
              onClick={() => { onSelectionChange([]); onCategoricalSelectionChange([]) }}
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 mb-5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            100% coverage
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Partial (50–99%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Sparse (&lt;50%)
          </span>
        </div>

        {/* Common numeric */}
        {commonNumeric.length > 0 && (
          <ColSection
            label={`Common numeric fields (${commonNumeric.length})`}
            cols={commonNumeric}
            selectedColumns={selectedColumns}
            recMap={recMap}
            onToggle={toggle}
          />
        )}

        {/* Partial numeric */}
        {partialNumeric.length > 0 && (
          <ColSection
            label={`Partial numeric fields (${partialNumeric.length}) — imputed with median`}
            cols={partialNumeric}
            selectedColumns={selectedColumns}
            recMap={recMap}
            onToggle={toggle}
            dimmed
          />
        )}

        {/* Encodable categorical */}
        {encodableCols.length > 0 && (
          <div className="mt-5">
            <SectionLabel>
              Categorical fields — encodable ({encodableCols.length})
              <span className="ml-1.5 text-violet-400 font-normal normal-case">
                · one-hot encoded for clustering
              </span>
            </SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              {encodableCols.map((col) => (
                <CatEncodableCard
                  key={col.name}
                  col={col}
                  checked={selectedCategoricalColumns.includes(col.name)}
                  recWeight={recMap[col.name]}
                  onToggle={() => toggleCat(col.name)}
                />
              ))}
            </div>
          </div>
        )}

        {/* High-cardinality categorical (not usable) */}
        {highCardinalityCols.length > 0 && (
          <div className="mt-5">
            <SectionLabel dimmed>
              High-cardinality fields ({highCardinalityCols.length}) — too many unique values for encoding
            </SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              {highCardinalityCols.map((col) => (
                <CatCard key={col.name} col={col} />
              ))}
            </div>
          </div>
        )}

        {selectedColumns.length === 0 && selectedCategoricalColumns.length === 0 && (
          <div className="mt-5 bg-amber-900/20 border border-amber-800/40 text-amber-400 rounded-lg p-3 text-sm">
            Select at least one field to run clustering.
          </div>
        )}
      </div>

      {/* Feature weights panel */}
      {allSelected.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-300 font-semibold">
              Feature Weights
              <span className="ml-2 text-slate-500 font-normal text-sm">
                — adjust relative influence on clustering distance
              </span>
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={applyRecommendations}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  allMatchRec
                    ? 'border-emerald-800 text-emerald-500 bg-emerald-900/20 cursor-default'
                    : 'border-violet-700 text-violet-400 hover:bg-violet-900/20'
                }`}
                disabled={allMatchRec}
                title="Set all weights to the recommended values"
              >
                {allMatchRec ? '✓ Using suggestions' : '✦ Apply suggestions'}
              </button>
              <button
                onClick={() => allSelected.forEach((c) => onWeightChange(c, 1.0))}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Reset all
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {selectedColumns.map((col) => (
              <WeightRow
                key={col}
                col={col}
                weight={weights[col] ?? 1.0}
                recommendedWeight={recMap[col]}
                onChange={(v) => onWeightChange(col, v)}
                onRemove={() => onSelectionChange(selectedColumns.filter((c) => c !== col))}
                badge="num"
              />
            ))}
            {selectedCategoricalColumns.map((col) => (
              <WeightRow
                key={col}
                col={col}
                weight={weights[col] ?? 1.0}
                recommendedWeight={recMap[col]}
                onChange={(v) => onWeightChange(col, v)}
                onRemove={() => onCategoricalSelectionChange(selectedCategoricalColumns.filter((c) => c !== col))}
                badge="cat"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ColSection({ label, cols, selectedColumns, recMap, onToggle, dimmed }) {
  return (
    <div className={`mt-5 ${dimmed ? 'opacity-90' : ''}`}>
      <SectionLabel dimmed={dimmed}>{label}</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        {cols.map((col) => (
          <ColumnCard
            key={col.name}
            col={col}
            checked={selectedColumns.includes(col.name)}
            recWeight={recMap[col.name]}
            onToggle={() => onToggle(col.name)}
          />
        ))}
      </div>
    </div>
  )
}

function SectionLabel({ children, dimmed }) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-wider ${dimmed ? 'text-slate-600' : 'text-slate-500'}`}>
      {children}
    </p>
  )
}

function RecBadge({ weight }) {
  if (weight == null) return null
  const color =
    weight >= 2.5 ? 'text-orange-400 border-orange-800/50 bg-orange-900/20'
    : weight >= 1.5 ? 'text-amber-400 border-amber-800/50 bg-amber-900/20'
    : weight <= 0.3 ? 'text-slate-500 border-slate-700 bg-slate-800/40'
    : 'text-violet-400 border-violet-800/50 bg-violet-900/20'
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded border font-mono shrink-0 ${color}`}
      title={`Suggested weight: ${weight}×`}
    >
      ✦{weight}×
    </span>
  )
}

function ColumnCard({ col, checked, recWeight, onToggle }) {
  const cov = coverageLabel(col.coverage)
  const short = shortName(col.name)
  const isLong = col.name !== short

  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
        checked
          ? 'border-indigo-600/60 bg-indigo-900/20 hover:bg-indigo-900/30'
          : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-200 truncate" title={col.name}>
            {short}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${cov.cls}`}>
            {cov.label}
          </span>
          {checked && <RecBadge weight={recWeight} />}
        </div>
        {isLong && (
          <p className="text-xs text-slate-600 mt-0.5 truncate font-mono">{col.name}</p>
        )}
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {col.sample_values.map((v) => String(v)).join(', ')}
        </p>
      </div>
    </label>
  )
}

function CatEncodableCard({ col, checked, recWeight, onToggle }) {
  const cov = coverageLabel(col.coverage)
  const short = shortName(col.name)
  const isLong = col.name !== short

  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
        checked
          ? 'border-violet-600/60 bg-violet-900/20 hover:bg-violet-900/30'
          : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 rounded border-slate-600 bg-slate-700 text-violet-600 focus:ring-violet-500 focus:ring-offset-slate-900 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-200 truncate" title={col.name}>
            {short}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${cov.cls}`}>
            {cov.label}
          </span>
          <span className="text-xs bg-violet-900/40 text-violet-400 border border-violet-800/50 px-1.5 py-0.5 rounded shrink-0">
            {col.cardinality} vals
          </span>
          {checked && <RecBadge weight={recWeight} />}
        </div>
        {isLong && (
          <p className="text-xs text-slate-600 mt-0.5 truncate font-mono">{col.name}</p>
        )}
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {col.sample_values.map((v) => String(v)).join(', ')}
        </p>
      </div>
    </label>
  )
}

function CatCard({ col }) {
  const cov = coverageLabel(col.coverage)
  const short = shortName(col.name)
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 opacity-40">
      <div className="w-4 h-4 mt-0.5 rounded border border-slate-700 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-400 truncate">{short}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${cov.cls}`}>
            {cov.label}
          </span>
          {col.cardinality != null && (
            <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded shrink-0">
              {col.cardinality} vals
            </span>
          )}
        </div>
        <p className="text-xs text-slate-600 mt-0.5 truncate">
          {col.sample_values.map((v) => String(v)).join(', ')}
        </p>
      </div>
    </div>
  )
}

function WeightRow({ col, weight, recommendedWeight, onChange, onRemove, badge }) {
  const short = shortName(col)
  const rec = recommendedWeight ?? 1.0
  const diffFromRec = Math.abs(weight - rec) > 0.05

  const weightColor =
    weight > 1.5 ? 'text-orange-400'
    : weight > 1.0 ? 'text-amber-400'
    : weight < 0.5 ? 'text-blue-400'
    : weight < 1.0 ? 'text-sky-400'
    : 'text-slate-400'

  const trackColor =
    weight > 1.0 ? '#f59e0b'
    : weight < 1.0 ? '#60a5fa'
    : '#6366f1'

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onRemove}
        className="text-slate-600 hover:text-red-400 transition-colors shrink-0 text-sm leading-none"
        title="Remove feature"
      >
        ×
      </button>
      <div className="w-36 shrink-0 flex items-center gap-1.5 min-w-0">
        <span
          className="text-sm text-slate-300 truncate font-mono"
          title={col}
        >
          {short}
        </span>
        {badge === 'cat' && (
          <span className="text-xs bg-violet-900/40 text-violet-400 border border-violet-800/50 px-1 rounded shrink-0">cat</span>
        )}
      </div>
      <div className="flex-1 flex items-center gap-2">
        <span className="text-xs text-slate-600 w-8 text-right shrink-0">0.1×</span>
        <input
          type="range"
          min={0.1}
          max={10}
          step={0.1}
          value={weight}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 cursor-pointer rounded-full appearance-none"
          style={{ accentColor: trackColor }}
        />
        <span className="text-xs text-slate-600 w-6 shrink-0">10×</span>
      </div>
      <span className={`text-sm font-bold w-10 text-right shrink-0 tabular-nums ${weightColor}`}>
        {weight.toFixed(1)}×
      </span>
      <div className="flex gap-1 shrink-0">
        {[0.5, 1, 2, 3, 5].map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`text-xs w-7 py-0.5 rounded transition-colors ${
              Math.abs(weight - v) < 0.05
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
            }`}
          >
            {v}×
          </button>
        ))}
        {/* Recommended value quick-pick */}
        {diffFromRec && rec !== 0.5 && rec !== 1 && rec !== 2 && rec !== 3 && rec !== 5 && (
          <button
            onClick={() => onChange(rec)}
            className="text-xs px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-400 border border-violet-800/50 hover:bg-violet-800/40 transition-colors"
            title="Apply suggested weight"
          >
            ✦{rec}×
          </button>
        )}
      </div>
    </div>
  )
}
