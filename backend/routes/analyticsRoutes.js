import express from "express";

import {
  getAnalyticsClusters,
  getAnalyticsCorrelations,
  getAnalyticsSummary,
} from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/summary", getAnalyticsSummary);
router.get("/correlations", getAnalyticsCorrelations);
router.get("/clusters", getAnalyticsClusters);

export default router;
