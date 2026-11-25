
import express from "express";

import {
  createActivity,
  getActivities,
  getActivityById,
  updateActivity,
  deleteActivity,
} from "../controllers/activityController.js";

const router = express.Router();

// Create activity
router.post("/", createActivity);

// Get all activities
router.get("/", getActivities);

// Get activity by ID
router.get("/:id", getActivityById);

// Update activity
router.put("/:id", updateActivity);

// Delete activity
router.delete("/:id", deleteActivity);

export default router;
