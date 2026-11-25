import { useEffect, useState } from 'react'
import {
  createActivity,
  deleteActivity,
  deleteDailyMetric,
  getActivities,
  getDailyMetrics,
  saveDailyMetric,
} from './services/api'
import Dashboard from './Dashboard'
import Analytics from './Analytics'
import './App.css'

const categories = [
  'study',
  'coding',
  'work',
  'exercise',
  'personal',
  'entertainment',
  'rest',
  'other',
]

const emptyForm = {
  title: '',
  category: 'study',
  startTime: '',
  endTime: '',
  focusRating: '3',
  isProductive: false,
  notes: '',
}

function getErrorMessage(error) {
  return error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
}

async function fetchActivities() {
  const data = await getActivities()
  if (!Array.isArray(data)) {
    throw new Error('The activity service returned an unexpected response.')
  }
  return data
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isValidMetricDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function fetchDailyMetrics() {
  const data = await getDailyMetrics()
  if (!Array.isArray(data)) {
    throw new Error('The daily metrics service returned an unexpected response.')
  }
  return data
}

function formatMetricDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getActivityDisplayText(value) {
  return String(value ?? '')
    .replace(/\bsynthetic\s+demo\s+data\s*:\s*/gi, '')
    .replace(/\bdemo\s*:\s*/gi, '')
    .replace(/\bdemo\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function ActivityCard({ activity, onDelete, deleting }) {
  const displayTitle = getActivityDisplayText(activity.title) || 'Activity'
  const displayNotes = getActivityDisplayText(activity.notes)

  return (
    <article className="activity-card">
      <div className="activity-marker" aria-hidden="true">
        <span />
      </div>
      <div className="activity-content">
        <div className="activity-heading">
          <div className="activity-title-group">
            <h3>{displayTitle}</h3>
            <span className={`category-tag category-${activity.category}`}>
              {activity.category}
            </span>
          </div>
          <button
            className="delete-button"
            type="button"
            onClick={() => onDelete(activity)}
            disabled={deleting}
            aria-label={`Delete ${displayTitle}`}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        <div className="activity-details">
          <span>
            <span className="detail-icon" aria-hidden="true">◷</span>
            {formatDateTime(activity.startTime)}
          </span>
          <span>
            <span className="detail-icon" aria-hidden="true">⌛</span>
            {activity.durationMinutes} min
          </span>
          <span>
            <span className="detail-icon" aria-hidden="true">✦</span>
            Focus {activity.focusRating}/5
          </span>
          <span className={activity.isProductive ? 'productive' : 'not-productive'}>
            <span className="status-dot" aria-hidden="true" />
            {activity.isProductive ? 'Productive' : 'Not productive'}
          </span>
        </div>

        {displayNotes && <p className="activity-notes">{displayNotes}</p>}
      </div>
    </article>
  )
}

function DailyMetricCard({ metric, onDelete, deleting }) {
  const ratingLabels = ['', 'Very low', 'Low', 'Moderate', 'High', 'Very high']

  return (
    <article className="daily-metric-card">
      <div className="daily-metric-card-heading">
        <h3>{formatMetricDate(metric.date)}</h3>
        <button
          className="delete-button"
          type="button"
          onClick={() => onDelete(metric)}
          disabled={deleting}
          aria-label={`Delete daily metrics for ${metric.date}`}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      <div className="metric-values">
        <div className="metric-value">
          <span>Sleep</span>
          <strong>{Number(metric.sleepHours).toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> hrs</small></strong>
        </div>
        <div className="metric-value">
          <span>Mood</span>
          <strong>{metric.mood}<small> / 5 · {ratingLabels[metric.mood]}</small></strong>
        </div>
        <div className="metric-value">
          <span>Energy</span>
          <strong>{metric.energy}<small> / 5 · {ratingLabels[metric.energy]}</small></strong>
        </div>
        <div className="metric-value">
          <span>Distraction</span>
          <strong>{metric.distractionLevel}<small> / 5 · {ratingLabels[metric.distractionLevel]}</small></strong>
        </div>
      </div>
    </article>
  )
}

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [form, setForm] = useState(emptyForm)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [historyActionError, setHistoryActionError] = useState('')
  const [formMessage, setFormMessage] = useState(null)
  const [metricForm, setMetricForm] = useState(() => ({
    date: getLocalDateString(),
    sleepHours: '',
    mood: '',
    energy: '',
    distractionLevel: '',
  }))
  const [dailyMetrics, setDailyMetrics] = useState([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [metricsSaving, setMetricsSaving] = useState(false)
  const [deletingMetricDate, setDeletingMetricDate] = useState(null)
  const [metricsLoadError, setMetricsLoadError] = useState('')
  const [metricsActionError, setMetricsActionError] = useState('')
  const [metricFormMessage, setMetricFormMessage] = useState(null)

  async function loadActivities() {
    setLoading(true)
    setLoadError('')
    setHistoryActionError('')
    try {
      setActivities(await fetchActivities())
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetchActivities()
      .then((data) => {
        if (active) setActivities(data)
      })
      .catch((error) => {
        if (active) setLoadError(getErrorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function loadDailyMetrics() {
    setMetricsLoading(true)
    setMetricsLoadError('')
    setMetricsActionError('')
    try {
      setDailyMetrics(await fetchDailyMetrics())
    } catch (error) {
      setMetricsLoadError(getErrorMessage(error))
    } finally {
      setMetricsLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetchDailyMetrics()
      .then((data) => {
        if (active) setDailyMetrics(data)
      })
      .catch((error) => {
        if (active) setMetricsLoadError(getErrorMessage(error))
      })
      .finally(() => {
        if (active) setMetricsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setFormMessage(null)
  }

  function handleMetricChange(event) {
    const { name, value } = event.target
    setMetricForm((current) => ({ ...current, [name]: value }))
    setMetricFormMessage(null)
  }

  async function handleMetricSubmit(event) {
    event.preventDefault()
    setMetricFormMessage(null)

    const sleepHours = Number(metricForm.sleepHours)
    const mood = Number(metricForm.mood)
    const energy = Number(metricForm.energy)
    const distractionLevel = Number(metricForm.distractionLevel)
    const validDate = isValidMetricDate(metricForm.date)
    const validRatings = [mood, energy, distractionLevel].every(
      (rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5
    )

    if (
      !validDate ||
      metricForm.sleepHours === '' ||
      !Number.isFinite(sleepHours) ||
      sleepHours < 0 ||
      sleepHours > 24 ||
      !validRatings
    ) {
      setMetricFormMessage({
        type: 'error',
        text: 'Enter a valid date, sleep between 0 and 24 hours, and ratings from 1 to 5.',
      })
      return
    }

    setMetricsSaving(true)
    try {
      await saveDailyMetric(metricForm.date, {
        sleepHours,
        mood,
        energy,
        distractionLevel,
      })
      await loadDailyMetrics()
      setMetricFormMessage({
        type: 'success',
        text: `Daily metrics saved for ${formatMetricDate(metricForm.date)}.`,
      })
    } catch (error) {
      setMetricFormMessage({ type: 'error', text: getErrorMessage(error) })
    } finally {
      setMetricsSaving(false)
    }
  }

  async function handleDeleteMetric(metric) {
    if (!window.confirm(`Delete daily metrics for ${formatMetricDate(metric.date)}?`)) return

    setDeletingMetricDate(metric.date)
    setMetricsActionError('')
    try {
      await deleteDailyMetric(metric.date)
      await loadDailyMetrics()
    } catch (error) {
      setMetricsActionError(getErrorMessage(error))
    } finally {
      setDeletingMetricDate(null)
    }
  }

  async function refreshDashboard() {
    await Promise.all([loadActivities(), loadDailyMetrics()])
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormMessage(null)

    if (!form.title.trim() || !form.category || !form.startTime || !form.endTime) {
      setFormMessage({ type: 'error', text: 'Complete all required fields before saving.' })
      return
    }

    const startTime = new Date(form.startTime)
    const endTime = new Date(form.endTime)
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      endTime <= startTime
    ) {
      setFormMessage({ type: 'error', text: 'End time must be after start time.' })
      return
    }

    setSaving(true)
    try {
      const activity = await createActivity({
        title: form.title.trim(),
        category: form.category,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        focusRating: Number(form.focusRating),
        isProductive: form.isProductive,
        notes: form.notes.trim(),
      })
      setActivities((current) => [activity, ...current])
      setLoadError('')
      setForm({ ...emptyForm })
      setFormMessage({ type: 'success', text: 'Activity saved to your history.' })
    } catch (error) {
      setFormMessage({ type: 'error', text: getErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(activity) {
    const displayTitle = getActivityDisplayText(activity.title) || 'this activity'
    if (!window.confirm(`Delete "${displayTitle}" from your activity history?`)) return

    setDeletingId(activity._id)
    setHistoryActionError('')
    try {
      await deleteActivity(activity._id)
      setActivities((current) => current.filter((item) => item._id !== activity._id))
    } catch (error) {
      setHistoryActionError(getErrorMessage(error))
    } finally {
      setDeletingId(null)
    }
  }

  const pageContent = {
    dashboard: {
      eyebrow: 'YOUR PRODUCTIVITY, IN FOCUS',
      title: 'Dashboard',
      description: 'A thoughtful overview of your time, focus, and daily wellbeing.',
    },
    activity: {
      eyebrow: 'YOUR PRODUCTIVITY, IN FOCUS',
      title: 'Activity tracker',
      description: 'Capture what you work on and notice the patterns that help you thrive.',
    },
    metrics: {
      eyebrow: 'DAILY CHECK-IN',
      title: 'Daily metrics',
      description: 'Keep a simple record of how each day feels.',
    },
    analytics: {
      eyebrow: 'PATTERNS IN YOUR RECORDS',
      title: 'Analytics',
      description: 'Explore descriptive statistics and relationships in your recorded data.',
    },
  }[activePage]
  const dashboardError = [
    loadError && `Activities: ${loadError}`,
    metricsLoadError && `Daily metrics: ${metricsLoadError}`,
  ].filter(Boolean).join(' · ')

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Productivity Pattern Analyzer home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 17.5 9 12l3.2 3.2L20 7" />
              <path d="M14.5 7H20v5.5" />
            </svg>
          </span>
          <span>Productivity Pattern Analyzer</span>
        </a>
        <nav className="app-nav" aria-label="Main navigation">
          {[
            ['dashboard', 'Dashboard'],
            ['activity', 'Activity Tracker'],
            ['metrics', 'Daily Metrics'],
            ['analytics', 'Analytics'],
          ].map(([page, label]) => (
            <button
              className={activePage === page ? 'nav-link active' : 'nav-link'}
              key={page}
              type="button"
              onClick={() => setActivePage(page)}
              aria-current={activePage === page ? 'page' : undefined}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="topbar-label"><span className="online-dot" /> Personal workspace</div>
      </header>

      <section className="page-intro">
        <div>
          <p className="eyebrow">{pageContent.eyebrow}</p>
          <h1>{pageContent.title}</h1>
          <p className="intro-copy">{pageContent.description}</p>
        </div>
        <div className="date-chip">
          <span className="date-chip-icon" aria-hidden="true">▦</span>
          <span>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</span>
        </div>
      </section>

      {activePage === 'dashboard' && (
        <Dashboard
          activities={activities}
          dailyMetrics={dailyMetrics}
          loading={loading || metricsLoading}
          error={dashboardError}
          onRefresh={refreshDashboard}
        />
      )}

      {activePage === 'analytics' && <Analytics />}

      {activePage === 'activity' && (
      <div className="dashboard-grid">
        <section className="panel form-panel" aria-labelledby="new-activity-title">
          <div className="panel-heading">
            <div className="section-icon" aria-hidden="true">＋</div>
            <div>
              <h2 id="new-activity-title">Log an activity</h2>
              <p>Add a session to your personal timeline.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="title">Activity title <span className="required">*</span></label>
              <input
                id="title"
                name="title"
                type="text"
                placeholder="e.g. Build project presentation"
                value={form.title}
                onChange={handleChange}
                maxLength={120}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="category">Category <span className="required">*</span></label>
              <select id="category" name="category" value={form.category} onChange={handleChange} required>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="startTime">Start date &amp; time <span className="required">*</span></label>
                <input
                  id="startTime"
                  name="startTime"
                  type="datetime-local"
                  value={form.startTime}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="endTime">End date &amp; time <span className="required">*</span></label>
                <input
                  id="endTime"
                  name="endTime"
                  type="datetime-local"
                  value={form.endTime}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="focusRating">Focus rating</label>
              <select
                id="focusRating"
                name="focusRating"
                value={form.focusRating}
                onChange={handleChange}
                required
              >
                {[1, 2, 3, 4, 5].map((rating) => (
                  <option key={rating} value={rating}>{rating} — {['Low', 'Fair', 'Good', 'Strong', 'Excellent'][rating - 1]}</option>
                ))}
              </select>
            </div>

            <label className="productive-toggle">
              <input
                name="isProductive"
                type="checkbox"
                checked={form.isProductive}
                onChange={handleChange}
              />
              <span className="custom-checkbox" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6" /></svg>
              </span>
              <span>
                <strong>Mark as productive</strong>
                <small>This session moved me forward</small>
              </span>
            </label>

            <div className="field notes-field">
              <label htmlFor="notes">Notes <span className="optional">(optional)</span></label>
              <textarea
                id="notes"
                name="notes"
                placeholder="Anything worth remembering about this session?"
                value={form.notes}
                onChange={handleChange}
                rows="3"
              />
            </div>

            {formMessage && (
              <p className={`form-message ${formMessage.type}`} role={formMessage.type === 'error' ? 'alert' : 'status'}>
                {formMessage.text}
              </p>
            )}

            <button className="submit-button" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" /> Saving activity…</> : <><span aria-hidden="true">＋</span> Save activity</>}
            </button>
          </form>
        </section>

        <section className="panel history-panel" aria-labelledby="history-title">
          <div className="history-heading">
            <div className="panel-heading">
              <div className="section-icon history-icon" aria-hidden="true">▤</div>
              <div>
                <h2 id="history-title">Activity history</h2>
                <p>Your latest sessions, all in one place.</p>
              </div>
            </div>
            <button className="refresh-button" type="button" onClick={loadActivities} disabled={loading}>
              <svg className={loading ? 'refresh-spinning' : ''} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M16.5 6.5V3m0 3.5H13M3.5 13.5V17m0-3.5H7" />
                <path d="M4.6 7.2A6 6 0 0 1 15.5 5M15.4 12.8A6 6 0 0 1 4.5 15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>

          {historyActionError && (
            <p className="history-action-error" role="alert">{historyActionError}</p>
          )}

          {!loading && !loadError && activities.length > 0 && (
            <div className="history-count">{activities.length} {activities.length === 1 ? 'session' : 'sessions'}</div>
          )}

          {loadError && (
            <div className="load-error" role="alert">
              <p>{loadError}</p>
              <button type="button" onClick={loadActivities}>Try again</button>
            </div>
          )}

          {loading && (
            <div className="loading-state"><span className="spinner" /> Loading your activities…</div>
          )}

          {!loading && !loadError && activities.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">◷</div>
              <h3>Your timeline starts here</h3>
              <p>Once you log an activity, it will appear here.</p>
            </div>
          )}

          {!loading && !loadError && activities.length > 0 && (
            <div className="activity-list">
              {activities.map((activity) => (
                <ActivityCard
                  key={activity._id}
                  activity={activity}
                  onDelete={handleDelete}
                  deleting={deletingId === activity._id}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      )}

      {activePage === 'metrics' && (
      <section className="panel daily-metrics-panel" aria-labelledby="daily-metrics-title">
        <div className="history-heading">
          <div className="panel-heading">
            <div className="section-icon metrics-icon" aria-hidden="true">◉</div>
            <div>
              <h2 id="daily-metrics-title">Daily metrics</h2>
              <p>Keep a simple record of how each day feels.</p>
            </div>
          </div>
          <button
            className="refresh-button"
            type="button"
            onClick={loadDailyMetrics}
            disabled={metricsLoading}
          >
            <svg className={metricsLoading ? 'refresh-spinning' : ''} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M16.5 6.5V3m0 3.5H13M3.5 13.5V17m0-3.5H7" />
              <path d="M4.6 7.2A6 6 0 0 1 15.5 5M15.4 12.8A6 6 0 0 1 4.5 15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        <form className="metrics-form" onSubmit={handleMetricSubmit}>
          <div className="metrics-form-fields">
            <div className="field">
              <label htmlFor="metric-date">Date <span className="required">*</span></label>
              <input
                id="metric-date"
                name="date"
                type="date"
                value={metricForm.date}
                onChange={handleMetricChange}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="metric-sleep">Sleep hours <span className="required">*</span></label>
              <input
                id="metric-sleep"
                name="sleepHours"
                type="number"
                min="0"
                max="24"
                step="0.1"
                placeholder="e.g. 7.5"
                value={metricForm.sleepHours}
                onChange={handleMetricChange}
                required
              />
            </div>
            {[
              ['mood', 'Mood'],
              ['energy', 'Energy'],
              ['distractionLevel', 'Distraction level'],
            ].map(([name, label]) => (
              <div className="field" key={name}>
                <label htmlFor={`metric-${name}`}>{label} <span className="required">*</span></label>
                <select
                  id={`metric-${name}`}
                  name={name}
                  value={metricForm[name]}
                  onChange={handleMetricChange}
                  required
                >
                  <option value="" disabled>Select rating</option>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating} — {['Very low', 'Low', 'Moderate', 'High', 'Very high'][rating - 1]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {metricFormMessage && (
            <p className={`form-message ${metricFormMessage.type}`} role={metricFormMessage.type === 'error' ? 'alert' : 'status'}>
              {metricFormMessage.text}
            </p>
          )}

          <button className="submit-button metrics-submit" type="submit" disabled={metricsSaving}>
            {metricsSaving ? <><span className="spinner" /> Saving metrics…</> : <><span aria-hidden="true">＋</span> Save daily metrics</>}
          </button>
        </form>

        {metricsActionError && (
          <p className="history-action-error" role="alert">{metricsActionError}</p>
        )}

        {!metricsLoading && !metricsLoadError && dailyMetrics.length > 0 && (
          <div className="history-count">{dailyMetrics.length} {dailyMetrics.length === 1 ? 'day recorded' : 'days recorded'}</div>
        )}

        {metricsLoadError && (
          <div className="load-error" role="alert">
            <p>{metricsLoadError}</p>
            <button type="button" onClick={loadDailyMetrics}>Try again</button>
          </div>
        )}

        {metricsLoading && (
          <div className="loading-state"><span className="spinner" /> Loading daily metrics…</div>
        )}

        {!metricsLoading && !metricsLoadError && dailyMetrics.length === 0 && (
          <div className="empty-state metrics-empty-state">
            <div className="empty-icon" aria-hidden="true">◉</div>
            <h3>No daily metrics yet</h3>
            <p>Save your first check-in to start your daily record.</p>
          </div>
        )}

        {!metricsLoading && !metricsLoadError && dailyMetrics.length > 0 && (
          <div className="daily-metrics-list">
            {dailyMetrics.map((metric) => (
              <DailyMetricCard
                key={metric._id || metric.date}
                metric={metric}
                onDelete={handleDeleteMetric}
                deleting={deletingMetricDate === metric.date}
              />
            ))}
          </div>
        )}
      </section>
      )}

      <footer className="page-footer">
        <span>Small steps make meaningful patterns.</span>
        <span>Made for a more mindful workday</span>
      </footer>
    </main>
  )
}

export default App
