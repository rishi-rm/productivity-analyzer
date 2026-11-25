import axios from 'axios'

const api = axios.create({
  baseURL: (
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
  ).replace(/\/+$/, ''),
  headers: {
    'Content-Type': 'application/json',
  },
})

export async function getActivities() {
  const response = await api.get('/activities')
  return response.data
}

export async function createActivity(activity) {
  const response = await api.post('/activities', activity)
  return response.data
}

export async function updateActivity(id, activity) {
  const response = await api.put(`/activities/${id}`, activity)
  return response.data
}

export async function deleteActivity(id) {
  const response = await api.delete(`/activities/${id}`)
  return response.data
}

export async function getDailyMetrics() {
  const response = await api.get('/daily-metrics')
  return response.data
}

export async function getDailyMetricByDate(date) {
  const response = await api.get(`/daily-metrics/${date}`)
  return response.data
}

export async function saveDailyMetric(date, metric) {
  const response = await api.put(`/daily-metrics/${date}`, metric)
  return response.data
}

export async function deleteDailyMetric(date) {
  const response = await api.delete(`/daily-metrics/${date}`)
  return response.data
}

function analyticsRequestConfig() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return { params: { timezone } }
}

export async function getAnalyticsSummary() {
  const response = await api.get('/analytics/summary', analyticsRequestConfig())
  return response.data
}

export async function getAnalyticsCorrelations() {
  const response = await api.get('/analytics/correlations', analyticsRequestConfig())
  return response.data
}

export async function getAnalyticsClusters() {
  const response = await api.get('/analytics/clusters', analyticsRequestConfig())
  return response.data
}
