import DailyMetric from "../models/DailyMetric.js";
import { respondWithControllerError } from "../utils/controllerError.js";

function isValidDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date
  );
}

function validateDateParam(req, res) {
  if (!isValidDate(req.params.date)) {
    res.status(400).json({
      message: "Date must be a valid date in YYYY-MM-DD format",
    });
    return false;
  }

  return true;
}

function hasValidMetricValues(values) {
  const { sleepHours, mood, energy, distractionLevel } = values;

  return (
    typeof sleepHours === "number" &&
    Number.isFinite(sleepHours) &&
    sleepHours >= 0 &&
    sleepHours <= 24 &&
    [mood, energy, distractionLevel].every(
      (rating) =>
        Number.isInteger(rating) && rating >= 1 && rating <= 5
    )
  );
}

export async function saveDailyMetric(req, res) {
  if (!validateDateParam(req, res)) return;

  const { sleepHours, mood, energy, distractionLevel } = req.body ?? {};
  const values = { sleepHours, mood, energy, distractionLevel };

  if (!hasValidMetricValues(values)) {
    return res.status(400).json({
      message:
        "Provide sleepHours from 0 to 24 and integer mood, energy, and distractionLevel ratings from 1 to 5",
    });
  }

  try {
    const metric = await DailyMetric.findOneAndUpdate(
      { date: req.params.date },
      {
        $set: {
          date: req.params.date,
          ...values,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    res.json(metric);
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to save daily metric");
  }
}

export async function getDailyMetrics(req, res) {
  try {
    const metrics = await DailyMetric.find().sort({ date: -1 });
    res.json(metrics);
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to fetch daily metrics");
  }
}

export async function getDailyMetricByDate(req, res) {
  if (!validateDateParam(req, res)) return;

  try {
    const metric = await DailyMetric.findOne({ date: req.params.date });

    if (!metric) {
      return res.status(404).json({
        message: "Daily metric not found",
      });
    }

    res.json(metric);
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to fetch daily metric");
  }
}

export async function deleteDailyMetric(req, res) {
  if (!validateDateParam(req, res)) return;

  try {
    const metric = await DailyMetric.findOneAndDelete({
      date: req.params.date,
    });

    if (!metric) {
      return res.status(404).json({
        message: "Daily metric not found",
      });
    }

    res.json({
      message: "Daily metric deleted successfully",
    });
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to delete daily metric");
  }
}
