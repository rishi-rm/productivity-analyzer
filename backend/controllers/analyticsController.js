import axios from "axios";
import Activity from "../models/Activity.js";
import DailyMetric from "../models/DailyMetric.js";

function getTimezone(req, res) {
  const timezone = req.query.timezone;
  if (timezone === undefined) return "UTC";

  if (typeof timezone !== "string" || timezone.length > 64) {
    res.status(400).json({ message: "Timezone must be a valid IANA timezone" });
    return null;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch (error) {
    if (error instanceof RangeError) {
      res.status(400).json({ message: "Timezone must be a valid IANA timezone" });
      return null;
    }
    throw error;
  }
}

async function loadAnalyticsPayload(timezone) {
  const [activities, dailyMetrics] = await Promise.all([
    Activity.find(
      {},
      "_id title category startTime endTime durationMinutes focusRating isProductive"
    ).lean(),
    DailyMetric.find(
      {},
      "_id date sleepHours mood energy distractionLevel"
    ).lean(),
  ]);

  return {
    timezone,
    activities: activities.map((activity) => ({
      _id: String(activity._id),
      title: activity.title,
      category: activity.category,
      startTime: new Date(activity.startTime).toISOString(),
      endTime: new Date(activity.endTime).toISOString(),
      durationMinutes: activity.durationMinutes,
      focusRating: activity.focusRating,
      isProductive: activity.isProductive,
    })),
    dailyMetrics: dailyMetrics.map((metric) => ({
      _id: String(metric._id),
      date: metric.date,
      sleepHours: metric.sleepHours,
      mood: metric.mood,
      energy: metric.energy,
      distractionLevel: metric.distractionLevel,
    })),
  };
}

async function forwardAnalyticsRequest(analysis, req, res) {
  const timezone = getTimezone(req, res);
  if (!timezone) return;

  let payload;
  try {
    payload = await loadAnalyticsPayload(timezone);
  } catch (error) {
    console.error("Failed to fetch records for analytics:", error.message);
    return res.status(500).json({
      message: "Failed to fetch records for analytics",
    });
  }

  const serviceUrl = (
    process.env.ANALYTICS_SERVICE_URL || "http://localhost:8000"
  ).replace(/\/+$/, "");

  try {
    const response = await axios.post(
      `${serviceUrl}/api/analytics/${analysis}`,
      payload,
      { timeout: 15000 }
    );
    return res.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error(
          "Analytics service returned an error:",
          error.response.status
        );
        return res.status(502).json({
          message: "The analytics service could not process the request",
        });
      }

      console.error("Analytics service request failed:", error.message);
      return res.status(503).json({
        message:
          "Analytics service unavailable. Start the Python service and try again.",
      });
    }

    console.error("Unexpected analytics proxy error:", error.message);
    return res.status(502).json({
      message: "Unexpected error while requesting analytics",
    });
  }
}

export async function getAnalyticsSummary(req, res) {
  return forwardAnalyticsRequest("summary", req, res);
}

export async function getAnalyticsCorrelations(req, res) {
  return forwardAnalyticsRequest("correlations", req, res);
}

export async function getAnalyticsClusters(req, res) {
  return forwardAnalyticsRequest("clusters", req, res);
}
