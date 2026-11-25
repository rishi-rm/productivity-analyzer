import { useEffect, useState } from 'react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import {
  getAnalyticsClusters,
  getAnalyticsCorrelations,
  getAnalyticsSummary,
} from './services/api'

const categoryColors = [
  '#6f9c7d',
  '#718ab7',
  '#9b83b7',
  '#ce9166',
  '#c87b79',
  '#c5a650',
  '#6d9da1',
  '#9ba4ad',
]

const correlationLabels = {
  sleepHours: 'Sleep hours',
  mood: 'Mood',
  energy: 'Energy',
  distractionLevel: 'Distraction level',
  focusRating: 'Focus rating',
  productiveMinutes: 'Productive minutes',
}

const clusterFeatures = [
  ['trackedMinutes', 'Tracked time'],
  ['productiveMinutes', 'Productive time'],
  ['focusRating', 'Average focus'],
  ['sleepHours', 'Sleep'],
  ['mood', 'Mood'],
  ['energy', 'Energy'],
  ['distractionLevel', 'Distraction'],
]

function formatMinutes(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—'
  const minutes = Math.round(Number(value))
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${remainingMinutes} min`
  if (remainingMinutes === 0) return `${hours} hr`
  return `${hours} hr ${remainingMinutes} min`
}

function formatAverageMinutes(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—'
  if (Number(value) < 60) return `${Number(value).toFixed(1)} min`
  return formatMinutes(value)
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function getErrorMessage(error) {
  return (
    error.response?.data?.message ||
    (error.request
      ? 'Could not reach the analytics API. Check that the Express API and Python analytics service are running.'
      : error.message) ||
    'Unable to load analytics.'
  )
}

async function fetchAnalytics() {
  const [summary, correlations, clusters] = await Promise.all([
    getAnalyticsSummary(),
    getAnalyticsCorrelations(),
    getAnalyticsClusters(),
  ])

  if (
    !summary?.activitySummary ||
    !summary?.dailyMetricsSummary ||
    !Array.isArray(correlations?.correlations) ||
    !Array.isArray(clusters?.days) ||
    !Array.isArray(clusters?.clusters)
  ) {
    throw new Error('The analytics API returned an unexpected response.')
  }

  return { summary, correlations, clusters }
}

function SummaryCard({ label, value, caption }) {
  return (
    <article className="analytics-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="analytics-daily-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyState({ children }) {
  return <div className="analytics-empty-state">{children}</div>
}

function formatClusterValue(feature, value) {
  if (!Number.isFinite(Number(value))) return '—'
  if (feature === 'trackedMinutes' || feature === 'productiveMinutes') {
    return formatMinutes(value)
  }
  if (feature === 'sleepHours') return `${Number(value).toFixed(1)} hrs`
  return `${Number(value).toFixed(1)} / 5`
}

function buildInsights(summary, correlations, clusters) {
  const insights = []
  const { activitySummary, dailyMetricsSummary } = summary
  const categories = Object.entries(activitySummary.timeByCategory || {})
    .map(([name, minutes]) => ({ name, minutes: Number(minutes) }))
    .filter((category) => Number.isFinite(category.minutes))
    .sort((first, second) => second.minutes - first.minutes)

  if (categories.length > 0) {
    const topCategory = categories[0]
    insights.push(
      `${topCategory.name} has the most tracked time at ${formatMinutes(topCategory.minutes)}.`
    )
  } else {
    insights.push('No category time is available yet.')
  }

  if (
    activitySummary.averageFocusRating !== null &&
    activitySummary.averageFocusRating !== undefined &&
    Number.isFinite(Number(activitySummary.averageFocusRating))
  ) {
    insights.push(
      `Average focus across ${activitySummary.activityCount} activities is ${Number(activitySummary.averageFocusRating).toFixed(1)} out of 5.`
    )
  } else {
    insights.push('There is not enough activity data to calculate average focus.')
  }

  if (clusters.status === 'ok' && clusters.clusters.length > 0) {
    const largestGroupSize = Math.max(
      ...clusters.clusters.map((cluster) => cluster.dayCount)
    )
    const mostCommon = clusters.clusters.filter(
      (cluster) => cluster.dayCount === largestGroupSize
    )
    const groupLabels = mostCommon.map((cluster) => `Cluster ${cluster.cluster}`)
    insights.push(
      `${groupLabels.join(' and ')} ${mostCommon.length === 1 ? 'is' : 'are'} the most common recorded group${mostCommon.length === 1 ? '' : 's'} (${largestGroupSize} days).`
    )
  } else {
    insights.push(clusters.message || 'There is not enough data to group recorded days.')
  }

  if (correlations.status === 'ok' && correlations.correlations.length > 0) {
    const strongest = correlations.correlations.reduce((current, candidate) =>
      Math.abs(candidate.value) > Math.abs(current.value) ? candidate : current
    )
    const direction = strongest.value > 0 ? 'positive' : 'negative'
    const strength = Math.abs(strongest.value) >= 0.7 ? 'Strongest' : 'Largest'
    insights.push(
      `${strength} returned correlation: ${correlationLabels[strongest.variable1] || strongest.variable1} and ${correlationLabels[strongest.variable2] || strongest.variable2} (${direction}, ${strongest.value.toFixed(2)}). This is an association, not evidence of causation.`
    )
  } else {
    insights.push(correlations.message || 'There is not enough data to calculate correlations.')
  }

  if (dailyMetricsSummary.daysRecorded === 0) {
    insights.push('No daily metrics have been recorded yet.')
  }

  return insights
}

function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchAnalytics()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((fetchError) => {
        if (active) setError(getErrorMessage(fetchError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function handleRefresh() {
    setLoading(true)
    setError('')
    try {
      setData(await fetchAnalytics())
    } catch (fetchError) {
      setError(getErrorMessage(fetchError))
    } finally {
      setLoading(false)
    }
  }

  const summary = data?.summary
  const activitySummary = summary?.activitySummary
  const dailySummary = summary?.dailyMetricsSummary
  const correlations = data?.correlations
  const clusters = data?.clusters
  const categoryData = activitySummary
    ? Object.entries(activitySummary.timeByCategory || {})
        .map(([name, minutes]) => ({ name, minutes: Number(minutes) }))
        .filter((category) => Number.isFinite(category.minutes) && category.minutes > 0)
        .sort((first, second) => second.minutes - first.minutes)
    : []
  const insights = data
    ? buildInsights(summary, correlations, clusters)
    : []

  return (
    <section className="analytics-page" aria-label="Analytics">
      <div className="analytics-toolbar">
        <div>
          <p className="eyebrow">YOUR DATA, MADE CLEAR</p>
          <h2>Analytics overview</h2>
          <p>Descriptive summaries and exploratory patterns from your records.</p>
        </div>
        <button
          className="refresh-button"
          type="button"
          onClick={handleRefresh}
          disabled={loading}
        >
          <svg className={loading ? 'refresh-spinning' : ''} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M16.5 6.5V3m0 3.5H13M3.5 13.5V17m0-3.5H7" />
            <path d="M4.6 7.2A6 6 0 0 1 15.5 5M15.4 12.8A6 6 0 0 1 4.5 15" />
          </svg>
          <span>Refresh analytics</span>
        </button>
      </div>

      {error && data && <div className="analytics-error" role="alert">{error}</div>}

      {loading && !data ? (
        <div className="panel analytics-loading">
          <span className="spinner" />
          Loading analytics…
        </div>
      ) : !data ? (
        <div className="panel analytics-load-error">
          <div className="empty-icon" aria-hidden="true">!</div>
          <h3>Analytics could not be loaded</h3>
          <p>{error}</p>
          <button className="submit-button analytics-retry" type="button" onClick={handleRefresh}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <section className="analytics-section" aria-labelledby="descriptive-summary-title">
            <div className="analytics-section-heading">
              <div>
                <h3 id="descriptive-summary-title">Descriptive statistics</h3>
                <p>A summary of recorded activity and daily check-ins.</p>
              </div>
            </div>

            <div className="analytics-summary-grid">
              <SummaryCard
                label="Total tracked time"
                value={formatMinutes(activitySummary.totalTrackedMinutes)}
                caption={`${activitySummary.activityCount} activities`}
              />
              <SummaryCard
                label="Productive time"
                value={formatMinutes(activitySummary.totalProductiveMinutes)}
                caption={`${activitySummary.productiveActivityCount} productive activities`}
              />
              <SummaryCard
                label="Average activity duration"
                value={formatAverageMinutes(activitySummary.averageActivityDurationMinutes)}
                caption="Per recorded activity"
              />
              <SummaryCard
                label="Average focus rating"
                value={
                  activitySummary.averageFocusRating !== null &&
                  activitySummary.averageFocusRating !== undefined &&
                  Number.isFinite(Number(activitySummary.averageFocusRating))
                    ? `${Number(activitySummary.averageFocusRating).toFixed(1)} / 5`
                    : '—'
                }
                caption="Across activities with a focus rating"
              />
              <SummaryCard
                label="Activities"
                value={activitySummary.activityCount}
                caption={`${activitySummary.productiveActivityCount} marked productive`}
              />
            </div>

            <div className="panel analytics-detail-panel">
              <div className="analytics-section-heading">
                <div>
                  <h4>Daily metrics averages</h4>
                  <p>{dailySummary.daysRecorded} recorded days</p>
                </div>
              </div>
              {dailySummary.daysRecorded === 0 ? (
                <EmptyState>No daily metrics have been recorded yet.</EmptyState>
              ) : (
                <div className="analytics-daily-grid">
                  <MetricCard
                    label="Average sleep"
                    value={dailySummary.averageSleepHours === null ? '—' : `${Number(dailySummary.averageSleepHours).toFixed(1)} hrs`}
                  />
                  <MetricCard
                    label="Average mood"
                    value={dailySummary.averageMood === null ? '—' : `${Number(dailySummary.averageMood).toFixed(1)} / 5`}
                  />
                  <MetricCard
                    label="Average energy"
                    value={dailySummary.averageEnergy === null ? '—' : `${Number(dailySummary.averageEnergy).toFixed(1)} / 5`}
                  />
                  <MetricCard
                    label="Average distraction"
                    value={dailySummary.averageDistractionLevel === null ? '—' : `${Number(dailySummary.averageDistractionLevel).toFixed(1)} / 5`}
                  />
                </div>
              )}
            </div>

            <div className="panel analytics-detail-panel category-summary-panel">
              <div className="analytics-section-heading">
                <div>
                  <h4>Time spent per category</h4>
                  <p>Tracked minutes grouped by category.</p>
                </div>
              </div>
              {categoryData.length === 0 ? (
                <EmptyState>No categorized activity time is available yet.</EmptyState>
              ) : (
                <div className="analytics-category-layout">
                  <div className="analytics-category-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          dataKey="minutes"
                          nameKey="name"
                          innerRadius="55%"
                          outerRadius="88%"
                          paddingAngle={3}
                        >
                          {categoryData.map((category, index) => (
                            <Cell
                              key={category.name}
                              fill={categoryColors[index % categoryColors.length]}
                              stroke="none"
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => [`${formatMinutes(Number(value))}`, name]}
                          contentStyle={{ borderRadius: 9, borderColor: '#e7ecef', fontSize: 11 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="analytics-category-list">
                    {categoryData.map((category, index) => (
                      <li key={category.name}>
                        <span>
                          <i style={{ backgroundColor: categoryColors[index % categoryColors.length] }} />
                          {category.name}
                        </span>
                        <strong>{formatMinutes(category.minutes)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="correlations-title">
            <div className="analytics-section-heading">
              <div>
                <h3 id="correlations-title">Correlation analysis</h3>
                <p>{correlations.observations} recorded dates included in analysis.</p>
              </div>
            </div>
            <div className="panel analytics-detail-panel">
              <p className="analytics-explanation">
                Correlation describes how two variables move together. It does not prove that one causes the other.
              </p>
              {correlations.status !== 'ok' ? (
                <EmptyState>{correlations.message}</EmptyState>
              ) : correlations.correlations.length === 0 ? (
                <EmptyState>No correlation pairs are available.</EmptyState>
              ) : (
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th scope="col">Variable 1</th>
                        <th scope="col">Variable 2</th>
                        <th scope="col">Relationship</th>
                        <th scope="col">Coefficient</th>
                        <th scope="col">Paired dates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {correlations.correlations.map((correlation, index) => {
                        const coefficient = Number(correlation.value)
                        const direction = coefficient > 0
                          ? 'positive'
                          : coefficient < 0
                            ? 'negative'
                            : 'neutral'
                        return (
                          <tr key={`${correlation.variable1}-${correlation.variable2}-${index}`}>
                            <td>{correlationLabels[correlation.variable1] || correlation.variable1}</td>
                            <td>{correlationLabels[correlation.variable2] || correlation.variable2}</td>
                            <td><span className={`correlation-direction ${direction}`}>{direction}</span></td>
                            <td className="correlation-value">{coefficient.toFixed(4)}</td>
                            <td>{correlation.observations}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="clusters-title">
            <div className="analytics-section-heading">
              <div>
                <h3 id="clusters-title">K-Means day groups</h3>
                <p>Groups of days based on recorded activity and daily metrics.</p>
              </div>
            </div>
            <div className="panel analytics-detail-panel">
              <p className="analytics-explanation">{clusters.message}</p>
              {clusters.status !== 'ok' ? (
                <EmptyState>{clusters.message}</EmptyState>
              ) : clusters.clusters.length === 0 ? (
                <EmptyState>No day groups are available.</EmptyState>
              ) : (
                <>
                  <p className="cluster-count">{clusters.clusterCount} clusters · exploratory groups, not quality ratings</p>
                  <div className="cluster-grid">
                    {clusters.clusters.map((cluster) => {
                      const assignedDays = clusters.days
                        .filter((day) => day.cluster === cluster.cluster)
                        .map((day) => day.date)
                      return (
                        <article className="cluster-card" key={cluster.cluster}>
                          <div className="cluster-card-heading">
                            <div>
                              <span className="cluster-kicker">RECORDED DAY GROUP</span>
                              <h4>Cluster {cluster.cluster}</h4>
                            </div>
                            <span className="cluster-day-count">{cluster.dayCount} days</span>
                          </div>
                          <div className="cluster-characteristics">
                            {clusterFeatures.map(([feature, label]) => (
                              <div key={feature}>
                                <span>{label}</span>
                                <strong>{formatClusterValue(feature, cluster.averages[feature])}</strong>
                              </div>
                            ))}
                          </div>
                          <div className="cluster-dates">
                            <span>Assigned dates</span>
                            <div>
                              {assignedDays.length > 0
                                ? assignedDays.map((day) => (
                                    <span className="cluster-date-chip" key={day}>{formatDate(day)}</span>
                                  ))
                                : <small>No dates assigned.</small>}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="analytics-section" aria-labelledby="insights-title">
            <div className="analytics-section-heading">
              <div>
                <h3 id="insights-title">Generated insights</h3>
                <p>Simple observations based only on the returned analytics.</p>
              </div>
            </div>
            <div className="panel analytics-insights">
              {insights.length === 0 ? (
                <EmptyState>There are not enough records to generate insights yet.</EmptyState>
              ) : (
                <ul>
                  {insights.map((insight) => (
                    <li key={insight}>
                      <span className="insight-mark" aria-hidden="true">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  )
}

export default Analytics
