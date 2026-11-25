import express from "express";

import {
  deleteDailyMetric,
  getDailyMetricByDate,
  getDailyMetrics,
  saveDailyMetric,
} from "../controllers/dailyMetricController.js";

const router = express.Router();

router.get("/", getDailyMetrics);
router.put("/:date", saveDailyMetric);
router.get("/:date", getDailyMetricByDate);
router.delete("/:date", deleteDailyMetric);

export default router;
