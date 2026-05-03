import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const detail = error.response?.data?.detail
    const msg = Array.isArray(detail)
      ? detail.map((e) => e.msg).join(', ')
      : typeof detail === 'string'
      ? detail
      : error.message || 'Unknown error'
    throw new Error(msg)
  },
)

export async function parseData(data) {
  const res = await api.post('/parse', { data })
  return res.data
}

export async function clusterData(payload) {
  const res = await api.post('/cluster', payload)
  return res.data
}
