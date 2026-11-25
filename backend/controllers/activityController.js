
import mongoose from "mongoose";
import Activity from "../models/Activity.js";
import { respondWithControllerError } from "../utils/controllerError.js";

function calculateDurationMinutes(start, end) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

// Create an activity
export async function createActivity(req, res) {
  try {
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        message: "Request body must be an activity object",
      });
    }

    const {
      title,
      category,
      startTime,
      endTime,
      focusRating,
      isProductive,
      notes,
    } = req.body;

    if (
      !title ||
      !category ||
      !startTime ||
      !endTime ||
      focusRating === undefined ||
      isProductive === undefined
    ) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return res.status(400).json({
        message: "End time must be after start time",
      });
    }

    const durationMinutes = calculateDurationMinutes(start, end);

    const activity = await Activity.create({
      title,
      category,
      startTime: start,
      endTime: end,
      durationMinutes,
      focusRating,
      isProductive,
      notes,
    });

    res.status(201).json(activity);
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to create activity");
  }
}

// Get all activities
export async function getActivities(req, res) {
  try {
    const activities = await Activity.find().sort({
      startTime: -1,
    });

    res.json(activities);
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to fetch activities");
  }
}

// Get one activity
export async function getActivityById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid activity ID",
      });
    }

    const activity = await Activity.findById(id);

    if (!activity) {
      return res.status(404).json({
        message: "Activity not found",
      });
    }

    res.json(activity);
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to fetch activity");
  }
}

// Update an activity
export async function updateActivity(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid activity ID",
      });
    }

    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        message: "Request body must be an activity object",
      });
    }

    const editableFields = [
      "title",
      "category",
      "startTime",
      "endTime",
      "focusRating",
      "isProductive",
      "notes",
    ];
    const updates = Object.fromEntries(
      editableFields
        .filter((field) => Object.prototype.hasOwnProperty.call(req.body, field))
        .map((field) => [field, req.body[field]])
    );

    const hasStartTime = Object.prototype.hasOwnProperty.call(
      updates,
      "startTime"
    );
    const hasEndTime = Object.prototype.hasOwnProperty.call(updates, "endTime");
    if (hasStartTime || hasEndTime) {
      const existing = await Activity.findById(id);

      if (!existing) {
        return res.status(404).json({
          message: "Activity not found",
        });
      }

      const startValue = hasStartTime ? updates.startTime : existing.startTime;
      const endValue = hasEndTime ? updates.endTime : existing.endTime;
      const start = new Date(startValue);
      const end = new Date(endValue);

      if (
        startValue === null ||
        startValue === "" ||
        endValue === null ||
        endValue === "" ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        return res.status(400).json({
          message: "End time must be after start time",
        });
      }

      updates.durationMinutes = calculateDurationMinutes(start, end);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "Provide at least one editable activity field",
      });
    }

    const activity = await Activity.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!activity) {
      return res.status(404).json({
        message: "Activity not found",
      });
    }

    res.json(activity);
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to update activity");
  }
}

// Delete an activity
export async function deleteActivity(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid activity ID",
      });
    }

    const activity = await Activity.findByIdAndDelete(id);

    if (!activity) {
      return res.status(404).json({
        message: "Activity not found",
      });
    }

    res.json({
      message: "Activity deleted successfully",
    });
  } catch (error) {
    return respondWithControllerError(res, error, "Failed to delete activity");
  }
}
