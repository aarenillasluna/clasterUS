export const CLUSTER_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
  '#eab308',
  '#84cc16',
]

export const NOISE_COLOR = '#64748b'

export function clusterColor(label) {
  if (label === -1 || label === '-1') return NOISE_COLOR
  return CLUSTER_COLORS[parseInt(label) % CLUSTER_COLORS.length]
}

function stringHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function groupHashColor(groupName) {
  if (!groupName || groupName === '__missing__') return NOISE_COLOR
  return CLUSTER_COLORS[stringHash(groupName) % CLUSTER_COLORS.length]
}
