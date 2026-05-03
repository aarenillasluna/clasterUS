import { useCallback, useRef, useState } from 'react'

export default function DataInput({ onDataParsed, loading }) {
  const [activeTab, setActiveTab] = useState('paste')
  const [textValue, setTextValue] = useState('')
  const [parseError, setParseError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const processJSON = useCallback(
    (jsonString) => {
      setParseError(null)
      try {
        const parsed = JSON.parse(jsonString)
        if (parsed === null || typeof parsed !== 'object') {
          throw new Error('JSON inválido — debe ser un array o un objeto que contenga un array')
        }
        onDataParsed(parsed)
      } catch (e) {
        setParseError(e.message)
      }
    },
    [onDataParsed],
  )

  const handleFileRead = useCallback(
    (file) => {
      if (!file.name.endsWith('.json')) {
        setParseError('Only .json files are supported')
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => processJSON(e.target.result)
      reader.onerror = () => setParseError('Failed to read file')
      reader.readAsText(file)
    },
    [processJSON],
  )

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFileRead(file)
    },
    [handleFileRead],
  )

  const loadSample = () => {
    setTextValue(JSON.stringify(generateSampleData(), null, 2))
    setActiveTab('paste')
    setParseError(null)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-indigo-950/60 border border-indigo-800/50 text-indigo-300 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
          Machine Learning · Unsupervised Clustering
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">
          Discover <span className="text-indigo-400">Patterns</span> in Your Data
        </h1>
        <p className="text-slate-400 text-lg">
          Load a JSON dataset, pick your features, and let K-Means or DBSCAN do the rest.
        </p>
      </div>

      <div className="card">
        <div className="flex gap-1 mb-6 bg-slate-800 p-1 rounded-lg">
          {[
            { id: 'paste', label: 'Paste JSON' },
            { id: 'upload', label: 'Upload File' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setParseError(null)
              }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'paste' && (
          <div>
            <textarea
              value={textValue}
              onChange={(e) => {
                setTextValue(e.target.value)
                setParseError(null)
              }}
              placeholder={'[\n  { "age": 25, "income": 48000, "score": 72 },\n  { "age": 34, "income": 67000, "score": 85 },\n  ...\n]'}
              className="input-field w-full h-64 font-mono text-sm resize-none leading-relaxed"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => processJSON(textValue)}
                disabled={!textValue.trim() || loading}
                className="btn-primary flex-1"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Parsing…
                  </span>
                ) : (
                  'Parse & Continue →'
                )}
              </button>
              <button onClick={loadSample} className="btn-secondary shrink-0">
                Load Sample
              </button>
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                  : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/30'
              }`}
            >
              <svg
                className="w-12 h-12 text-slate-500 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-slate-300 font-medium">
                {isDragging ? 'Drop it!' : 'Drop your .json file here'}
              </p>
              <p className="text-slate-500 text-sm mt-1">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileRead(file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )}

        {parseError && (
          <div className="mt-4 bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-3 text-sm flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {parseError}
          </div>
        )}
      </div>

      <p className="text-center text-slate-600 text-xs mt-5">
        Expected format: JSON array of flat objects · Max 100,000 rows
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function generateSampleData() {
  const rand = (mean, std) =>
    mean + std * ((Math.random() + Math.random() + Math.random() + Math.random()) / 2 - 1)
  const centers = [
    { age: 24, income: 38000, spending: 2200, score: 62 },
    { age: 48, income: 92000, spending: 7500, score: 88 },
    { age: 36, income: 61000, spending: 4100, score: 74 },
  ]
  const cities = ['NYC', 'LA', 'Chicago', 'Houston', 'Miami']
  return Array.from({ length: 150 }, (_, i) => {
    const c = centers[i % 3]
    return {
      age: Math.max(18, Math.round(rand(c.age, 5))),
      income: Math.max(20000, Math.round(rand(c.income, 7000))),
      spending: Math.max(500, Math.round(rand(c.spending, 600))),
      score: Math.min(100, Math.max(0, Math.round(rand(c.score, 7)))),
      city: cities[Math.floor(Math.random() * cities.length)],
    }
  })
}
