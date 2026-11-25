
import mongoose from "mongoose";

const dailyMetricSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      unique: true,
    },

    sleepHours: {
      type: Number,
      required: true,
      min: 0,
      max: 24,
    },

    mood: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    energy: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    distractionLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  {
    timestamps: true,
  }
);

const DailyMetric = mongoose.model(
  "DailyMetric",
  dailyMetricSchema
);

export default DailyMetric;
