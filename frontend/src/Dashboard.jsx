import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const categoryColors = {
  study: '#6f9c7d',
  coding: '#718ab7',
  work: '#9b83b7',
  exercise: '#ce9166',
  personal: '#c87b79',
  entertainment: '#c5a650',
  rest: '#6d9da1',
  other: '#9ba4ad',
}

const timeBlocks = [
  { name: 'Morning', start: 6, end: 12 },
  { name: 'Afternoon', start: 12, end: 17 },
  { name: 'Evening', start: 17, end: 21 },
  { name: 'Night', start: 21, end: 6 },
]

function getLocalDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDateRange(days) {
  const today = new Date()
  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - days + 1)

  return {
    today,
    start: getLocalDateKey(startDate),
    end: getLocalDateKey(endDate),
  }
}

function formatMinutes(minutes) {
  const wholeMinutes = Math.round(minutes)
  const hours = Math.floor(wholeMinutes / 60)
  const remainder = wholeMinutes % 60
  if (hours === 0) return `${remainder} min`
  if (remainder === 0) return `${hours} hr`
  return `${hours} hr ${remainder} min`
}

function formatLongDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function averageMetric(metrics, field) {
  if (metrics.length === 0) return null
  const values = metrics.map((metric) => Number(metric[field])).filter(Number.isFinite)
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function ChartEmptyState({ message }) {
  return <div className="chart-empty-state">{message}</div>
}

function SummaryCard({ label, value, caption, emphasis = false }) {
  return (
    <article className={`summary-card${emphasis ? ' summary-card-emphasis' : ''}`}>
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
      <span className="summary-caption">{caption}</span>
    </article>
  )
}

function Dashboard({ activities, dailyMetrics, loading, error, onRefresh }) {
  const [rangeDays, setRangeDays] = useState(7)
  const range = useMemo(() => getDateRange(rangeDays), [rangeDays])
  const rangeDaysForConsistency = getDateRange(7)

  const activitiesInRange = useMemo(
    () =>
      activities.filter((activity) => {
        const dateKey = getLocalDateKey(activity.startTime)
        return dateKey >= range.start && dateKey <= range.end
      }),
    [activities, range.start, range.end]
  )

  const metricsInRange = useMemo(
    () =>
      dailyMetrics.filter(
        (metric) => metric.date >= range.start && metric.date <= range.end
      ),
    [dailyMetrics, range.start, range.end]
  )

  const activityStats = useMemo(() => {
    const validActivities = activitiesInRange.filter(
      (activity) =>
        Number.isFinite(Number(activity.durationMinutes)) &&
        Number(activity.durationMinutes) >= 0 &&
        Number.isFinite(Number(activity.focusRating)) &&
        Number(activity.focusRating) >= 1 &&
        Number(activity.focusRating) <= 5
    )
    const trackedMinutes = validActivities.reduce(
      (total, activity) => total + Number(activity.durationMinutes),
      0
    )
    const focusedMinutes = Math.round(
      validActivities.reduce(
        (total, activity) =>
          total +
          Number(activity.durationMinutes) * (Number(activity.focusRating) / 5),
        0
      )
    )
    const productiveMinutes = validActivities.reduce(
      (total, activity) =>
        total +
        (activity.isProductive ? Number(activity.durationMinutes) : 0),
      0
    )
    const focusAverage =
      validActivities.length === 0
        ? 0
        : validActivities.reduce(
            (total, activity) => total + Number(activity.focusRating),
            0
          ) / validActivities.length

    const consistencyStart = rangeDaysForConsistency.start
    const activeDays = new Set(
      activities
        .filter((activity) => {
          const dateKey = getLocalDateKey(activity.startTime)
          return (
            dateKey >= consistencyStart &&
            dateKey <= rangeDaysForConsistency.end &&
            Number(activity.durationMinutes) > 0
          )
        })
        .map((activity) => getLocalDateKey(activity.startTime))
        .filter(Boolean)
    ).size

    const enoughData = validActivities.length > 0 && trackedMinutes > 0
    const focusPercent = (focusAverage / 5) * 100
    const productivePercent =
      trackedMinutes === 0 ? 0 : (productiveMinutes / trackedMinutes) * 100
    const consistencyPercent = (activeDays / 7) * 100
    const score = enoughData
      ? Math.round(
          focusPercent * 0.5 +
            productivePercent * 0.3 +
            consistencyPercent * 0.2
        )
      : null

    return {
      trackedMinutes,
      focusedMinutes,
      productiveMinutes,
      activeDays,
      score,
    }
  }, [activitiesInRange, activities, rangeDaysForConsistency.start, rangeDaysForConsistency.end])

  const trendData = useMemo(() => {
    const totalsByDate = new Map()
    activitiesInRange.forEach((activity) => {
      const dateKey = getLocalDateKey(activity.startTime)
      const duration = Number(activity.durationMinutes)
      if (!dateKey || !Number.isFinite(duration)) return
      totalsByDate.set(dateKey, (totalsByDate.get(dateKey) || 0) + duration)
    })

    const today = range.today
    return Array.from({ length: rangeDays }, (_, index) => {
      const date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - (rangeDays - index - 1)
      )
      const dateKey = getLocalDateKey(date)
      const labelDate = new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(date)

      return {
        dateKey,
        longDate: formatLongDate(dateKey),
        label: rangeDays === 7
          ? new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
          : labelDate,
        minutes: Math.round(totalsByDate.get(dateKey) || 0),
      }
    })
  }, [activitiesInRange, range.today, rangeDays])

  const categoryData = useMemo(() => {
    const totalsByCategory = new Map()
    activitiesInRange.forEach((activity) => {
      const duration = Number(activity.durationMinutes)
      if (!Number.isFinite(duration) || duration <= 0) return
      totalsByCategory.set(
        activity.category,
        (totalsByCategory.get(activity.category) || 0) + duration
      )
    })

    return [...totalsByCategory.entries()]
      .map(([name, minutes]) => ({ name, minutes: Math.round(minutes) }))
      .sort((first, second) => second.minutes - first.minutes)
  }, [activitiesInRange])

  const productiveTimeData = useMemo(
    () =>
      timeBlocks.map((block) => {
        const minutes = activitiesInRange.reduce((total, activity) => {
          if (!activity.isProductive) return total
          const startTime = new Date(activity.startTime)
          const hour = startTime.getHours()
          const inBlock =
            block.name === 'Night'
              ? hour >= block.start || hour < block.end
              : hour >= block.start && hour < block.end
          return inBlock
            ? total + Math.max(0, Number(activity.durationMinutes) || 0)
            : total
        }, 0)

        return { name: block.name, minutes: Math.round(minutes) }
      }),
    [activitiesInRange]
  )

  const averages = useMemo(
    () => ({
      sleepHours: averageMetric(metricsInRange, 'sleepHours'),
      mood: averageMetric(metricsInRange, 'mood'),
      energy: averageMetric(metricsInRange, 'energy'),
      distractionLevel: averageMetric(metricsInRange, 'distractionLevel'),
    }),
    [metricsInRange]
  )

  const hasProductiveTime = productiveTimeData.some((block) => block.minutes > 0)
  const rangeDescription = `${formatLongDate(range.start)} – ${formatLongDate(range.end)}`

  return (
    <section className="dashboard-page" aria-label="Productivity dashboard">
      <div className="dashboard-toolbar">
        <div>
          <p className="eyebrow">YOUR OVERVIEW</p>
          <h2>Patterns at a glance</h2>
          <p className="dashboard-range-description">{rangeDescription}</p>
        </div>
        <div className="dashboard-toolbar-actions">
          <div className="range-selector" role="group" aria-label="Dashboard date range">
            {[7, 30].map((days) => (
              <button
                className={rangeDays === days ? 'range-button active' : 'range-button'}
                key={days}
                type="button"
                onClick={() => setRangeDays(days)}
                aria-pressed={rangeDays === days}
              >
                Last {days} days
              </button>
            ))}
          </div>
          <button className="refresh-button dashboard-refresh" type="button" onClick={onRefresh} disabled={loading}>
            <svg className={loading ? 'refresh-spinning' : ''} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M16.5 6.5V3m0 3.5H13M3.5 13.5V17m0-3.5H7" />
              <path d="M4.6 7.2A6 6 0 0 1 15.5 5M15.4 12.8A6 6 0 0 1 4.5 15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && <div className="dashboard-error" role="alert">{error}</div>}

      {loading ? (
        <div className="panel dashboard-loading">
          <span className="spinner" />
          Loading your dashboard…
        </div>
      ) : (
        <>
          <div className="summary-grid">
            <SummaryCard
              label="Total tracked time"
              value={formatMinutes(activityStats.trackedMinutes)}
              caption={`${activitiesInRange.length} ${activitiesInRange.length === 1 ? 'activity' : 'activities'} in this range`}
            />
            <SummaryCard
              label="Estimated focused time"
              value={formatMinutes(activityStats.focusedMinutes)}
              caption="Estimated from duration × focus rating"
            />
            <SummaryCard
              label="Productivity score"
              value={activityStats.score === null ? 'Not enough data' : `${activityStats.score} / 100`}
              caption={
                activityStats.score === null
                  ? 'Log activity to calculate your score'
                  : `${activityStats.activeDays}/7 active days in the past week`
              }
              emphasis
            />
          </div>

          <p className="score-formula">
            Project-defined estimate, not scientifically validated: 50% average focus rating (out of 5) +
            30% productive time (productive minutes ÷ tracked minutes) + 20% tracking consistency
            (days with activity in the past 7 days ÷ 7).
          </p>

          <div className="charts-grid">
            <section className="panel chart-panel" aria-labelledby="activity-trend-title">
              <div className="chart-heading">
                <div>
                  <h3 id="activity-trend-title">Daily activity trend</h3>
                  <p>Tracked minutes · zero-activity days included</p>
                </div>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#edf0f3" strokeDasharray="3 4" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#8b96a2', fontSize: 10 }}
                      interval={rangeDays === 7 ? 0 : 'preserveStartEnd'}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#8b96a2', fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.longDate || _label}
                      formatter={(value) => [`${value} min`, 'Tracked time']}
                      contentStyle={{ borderRadius: 9, borderColor: '#e7ecef', fontSize: 11 }}
                    />
                    <Bar dataKey="minutes" fill="#6f9c7d" radius={[5, 5, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel chart-panel" aria-labelledby="category-title">
              <div className="chart-heading">
                <div>
                  <h3 id="category-title">Time by category</h3>
                  <p>Tracked minutes grouped by activity category</p>
                </div>
              </div>
              {categoryData.length === 0 ? (
                <ChartEmptyState message="No activity recorded in this date range." />
              ) : (
                <div className="category-chart-layout">
                  <div className="category-pie">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          dataKey="minutes"
                          nameKey="name"
                          innerRadius="57%"
                          outerRadius="88%"
                          paddingAngle={3}
                        >
                          {categoryData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={categoryColors[entry.name] || categoryColors.other}
                              stroke="none"
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => [`${value} min`, name]}
                          contentStyle={{ borderRadius: 9, borderColor: '#e7ecef', fontSize: 11 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="category-legend">
                    {categoryData.map((entry) => (
                      <li key={entry.name}>
                        <span className="category-legend-name">
                          <span style={{ backgroundColor: categoryColors[entry.name] || categoryColors.other }} />
                          {entry.name}
                        </span>
                        <strong>{formatMinutes(entry.minutes)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="panel chart-panel productive-chart-panel" aria-labelledby="productive-time-title">
              <div className="chart-heading">
                <div>
                  <h3 id="productive-time-title">Productive time by daypart</h3>
                  <p>Activity start time · productive activities only</p>
                </div>
              </div>
              {!hasProductiveTime ? (
                <ChartEmptyState message="No productive activity recorded in this date range." />
              ) : (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productiveTimeData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#edf0f3" strokeDasharray="3 4" vertical={false} />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#8b96a2', fontSize: 10 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#8b96a2', fontSize: 10 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        formatter={(value) => [`${value} min`, 'Productive time']}
                        contentStyle={{ borderRadius: 9, borderColor: '#e7ecef', fontSize: 11 }}
                      />
                      <Bar dataKey="minutes" fill="#718ab7" radius={[5, 5, 0, 0]} maxBarSize={52} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="time-block-key">Morning 6–12 · Afternoon 12–17 · Evening 17–21 · Night 21–6</p>
            </section>

            <section className="panel chart-panel daily-summary-panel" aria-labelledby="daily-summary-title">
              <div className="chart-heading">
                <div>
                  <h3 id="daily-summary-title">Daily metrics summary</h3>
                  <p>Average values in the selected date range</p>
                </div>
              </div>
              {metricsInRange.length === 0 ? (
                <ChartEmptyState message="No daily metrics recorded in this date range. Add a daily check-in to see your averages." />
              ) : (
                <div className="metric-average-grid">
                  <div className="metric-average-card">
                    <span>Average sleep</span>
                    <strong>{averages.sleepHours === null ? '—' : `${averages.sleepHours.toFixed(1)} hrs`}</strong>
                  </div>
                  <div className="metric-average-card">
                    <span>Average mood</span>
                    <strong>{averages.mood === null ? '—' : `${averages.mood.toFixed(1)} / 5`}</strong>
                  </div>
                  <div className="metric-average-card">
                    <span>Average energy</span>
                    <strong>{averages.energy === null ? '—' : `${averages.energy.toFixed(1)} / 5`}</strong>
                  </div>
                  <div className="metric-average-card">
                    <span>Average distraction</span>
                    <strong>{averages.distractionLevel === null ? '—' : `${averages.distractionLevel.toFixed(1)} / 5`}</strong>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  )
}

export default Dashboard
