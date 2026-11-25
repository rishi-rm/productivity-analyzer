import assert from "node:assert/strict";
import { test } from "node:test";
import axios, { AxiosError } from "axios";
import Activity from "../models/Activity.js";
import DailyMetric from "../models/DailyMetric.js";
import {
  createActivity,
  deleteActivity,
  getActivities,
  getActivityById,
  updateActivity,
} from "../controllers/activityController.js";
import {
  getAnalyticsClusters,
  getAnalyticsSummary,
} from "../controllers/analyticsController.js";
import {
  deleteDailyMetric,
  getDailyMetricByDate,
  getDailyMetrics,
  saveDailyMetric,
} from "../controllers/dailyMetricController.js";
import { respondWithControllerError } from "../utils/controllerError.js";

const validId = "507f1f77bcf86cd799439011";

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function replaceMethod(t, target, name, implementation) {
  const original = target[name];
  target[name] = implementation;
  t.after(() => {
    target[name] = original;
  });
}

test("activity creation calculates duration and ignores client duration", async (t) => {
  let created;
  replaceMethod(t, Activity, "create", async (record) => {
    created = record;
    return record;
  });

  const res = makeResponse();
  await createActivity(
    {
      body: {
        title: "Test session",
        category: "coding",
        startTime: "2026-11-25T10:00:00.000Z",
        endTime: "2026-11-25T11:20:00.000Z",
        durationMinutes: 999,
        focusRating: 4,
        isProductive: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(created.durationMinutes, 80);
  assert.equal(Object.hasOwn(created, "durationMinutes"), true);
});

test("activity creation rejects an end time before the start time", async (t) => {
  let createCalled = false;
  replaceMethod(t, Activity, "create", async () => {
    createCalled = true;
  });

  const res = makeResponse();
  await createActivity(
    {
      body: {
        title: "Invalid session",
        category: "coding",
        startTime: "2026-11-25T11:00:00.000Z",
        endTime: "2026-11-25T10:00:00.000Z",
        focusRating: 3,
        isProductive: false,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test("activity duration stays within the model's one-minute minimum", async (t) => {
  let created;
  replaceMethod(t, Activity, "create", async (record) => {
    created = record;
    return record;
  });

  const res = makeResponse();
  await createActivity(
    {
      body: {
        title: "Short session",
        category: "study",
        startTime: "2026-11-25T10:00:00.000Z",
        endTime: "2026-11-25T10:00:20.000Z",
        focusRating: 3,
        isProductive: false,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(created.durationMinutes, 1);
});

test("activity reads sort newest first and validate IDs", async (t) => {
  let sort;
  replaceMethod(t, Activity, "find", () => ({
    sort: async (value) => {
      sort = value;
      return [];
    },
  }));
  const listResponse = makeResponse();
  await getActivities({}, listResponse);
  assert.deepEqual(sort, { startTime: -1 });
  assert.deepEqual(listResponse.body, []);

  let findByIdCalled = false;
  replaceMethod(t, Activity, "findById", async () => {
    findByIdCalled = true;
    return { _id: validId };
  });
  const invalidResponse = makeResponse();
  await getActivityById({ params: { id: "invalid" } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(findByIdCalled, false);

  const validResponse = makeResponse();
  await getActivityById({ params: { id: validId } }, validResponse);
  assert.equal(validResponse.statusCode, 200);
  assert.equal(validResponse.body._id, validId);
});

test("activity updates recalculate duration from changed timestamps", async (t) => {
  let updated;
  replaceMethod(t, Activity, "findById", async () => ({
    startTime: new Date("2026-11-25T10:00:00.000Z"),
    endTime: new Date("2026-11-25T11:20:00.000Z"),
  }));
  replaceMethod(t, Activity, "findByIdAndUpdate", async (_id, values, options) => {
    updated = { values, options };
    return { _id: validId, ...values };
  });

  const res = makeResponse();
  await updateActivity(
    {
      params: { id: validId },
      body: {
        startTime: "2026-11-25T10:30:00.000Z",
        durationMinutes: 900,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(updated.values.durationMinutes, 50);
  assert.equal(Object.hasOwn(updated.values, "durationMinutes"), true);
  assert.equal(updated.values.durationMinutes === 900, false);
  assert.equal(updated.options.runValidators, true);
});

test("activity updates reject invalid time ranges", async (t) => {
  let updateCalled = false;
  replaceMethod(t, Activity, "findById", async () => ({
    startTime: new Date("2026-11-25T10:00:00.000Z"),
    endTime: new Date("2026-11-25T11:00:00.000Z"),
  }));
  replaceMethod(t, Activity, "findByIdAndUpdate", async () => {
    updateCalled = true;
  });

  const res = makeResponse();
  await updateActivity(
    {
      params: { id: validId },
      body: { endTime: "2026-11-25T09:00:00.000Z" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(updateCalled, false);
});

test("activity deletion returns the deleted record result", async (t) => {
  replaceMethod(t, Activity, "findByIdAndDelete", async () => ({ _id: validId }));
  const res = makeResponse();
  await deleteActivity({ params: { id: validId } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /deleted successfully/);
});

test("daily metric saves upsert the unique date with validators", async (t) => {
  const calls = [];
  replaceMethod(t, DailyMetric, "findOneAndUpdate", async (filter, update, options) => {
    calls.push({ filter, update, options });
    return { date: filter.date, ...update.$set };
  });

  for (const mood of [3, 5]) {
    const res = makeResponse();
    await saveDailyMetric(
      {
        params: { date: "2026-11-25" },
        body: { sleepHours: 7.5, mood, energy: 4, distractionLevel: 2 },
      },
      res
    );
    assert.equal(res.statusCode, 200);
  }

  assert.equal(DailyMetric.schema.path("date").options.unique, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].filter, { date: "2026-11-25" });
  assert.equal(calls[0].options.upsert, true);
  assert.equal(calls[0].options.runValidators, true);
  assert.equal(calls[1].update.$set.mood, 5);
});

test("daily metric rejects impossible dates and out-of-range values", async (t) => {
  let saveCalled = false;
  replaceMethod(t, DailyMetric, "findOneAndUpdate", async () => {
    saveCalled = true;
  });

  const invalidDate = makeResponse();
  await saveDailyMetric(
    {
      params: { date: "2026-02-30" },
      body: { sleepHours: 7, mood: 3, energy: 3, distractionLevel: 3 },
    },
    invalidDate
  );
  assert.equal(invalidDate.statusCode, 400);

  const invalidValue = makeResponse();
  await saveDailyMetric(
    {
      params: { date: "2026-11-25" },
      body: { sleepHours: 25, mood: 3, energy: 3, distractionLevel: 3 },
    },
    invalidValue
  );
  assert.equal(invalidValue.statusCode, 400);
  const invalidRating = makeResponse();
  await saveDailyMetric(
    {
      params: { date: "2026-11-25" },
      body: { sleepHours: 7, mood: 6, energy: 3, distractionLevel: 3 },
    },
    invalidRating
  );
  assert.equal(invalidRating.statusCode, 400);
  assert.equal(saveCalled, false);
});

test("Mongoose schemas enforce activity and daily metric constraints", async () => {
  const activity = new Activity({
    title: "Invalid category",
    category: "unknown",
    startTime: new Date("2026-11-25T10:00:00.000Z"),
    endTime: new Date("2026-11-25T11:00:00.000Z"),
    durationMinutes: 0,
    focusRating: 6,
    isProductive: false,
  });
  const activityError = await activity.validate().then(
    () => null,
    (error) => error
  );
  assert.ok(activityError.errors.category);
  assert.ok(activityError.errors.durationMinutes);
  assert.ok(activityError.errors.focusRating);

  const metric = new DailyMetric({
    date: "2026-11-25",
    sleepHours: 25,
    mood: 6,
    energy: 2,
    distractionLevel: 3,
  });
  const metricError = await metric.validate().then(
    () => null,
    (error) => error
  );
  assert.ok(metricError.errors.sleepHours);
  assert.ok(metricError.errors.mood);
});

test("daily metric reads and deletes use the selected date", async (t) => {
  let sort;
  replaceMethod(t, DailyMetric, "find", () => ({
    sort: async (value) => {
      sort = value;
      return [];
    },
  }));
  const listResponse = makeResponse();
  await getDailyMetrics({}, listResponse);
  assert.deepEqual(sort, { date: -1 });

  replaceMethod(t, DailyMetric, "findOne", async (query) => ({ date: query.date }));
  const byDateResponse = makeResponse();
  await getDailyMetricByDate({ params: { date: "2026-11-25" } }, byDateResponse);
  assert.equal(byDateResponse.body.date, "2026-11-25");

  replaceMethod(t, DailyMetric, "findOneAndDelete", async (query) => ({
    date: query.date,
  }));
  const deleteResponse = makeResponse();
  await deleteDailyMetric({ params: { date: "2026-11-25" } }, deleteResponse);
  assert.match(deleteResponse.body.message, /deleted successfully/);
});

test("unexpected controller errors do not expose internal messages", (t) => {
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });

  const res = makeResponse();
  respondWithControllerError(res, new Error("private database detail"), "Request failed");

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Request failed" });
  assert.equal(JSON.stringify(res.body).includes("private database detail"), false);
});

test("analytics proxy serializes database records and forwards the timezone", async (t) => {
  const startTime = new Date("2026-11-25T10:00:00.000Z");
  const endTime = new Date("2026-11-25T11:00:00.000Z");
  replaceMethod(t, Activity, "find", () => ({
    lean: async () => [
      {
        _id: "activity-id",
        title: "Test session",
        category: "study",
        startTime,
        endTime,
        durationMinutes: 60,
        focusRating: 4,
        isProductive: true,
      },
    ],
  }));
  replaceMethod(t, DailyMetric, "find", () => ({
    lean: async () => [
      {
        _id: "metric-id",
        date: "2026-11-25",
        sleepHours: 7,
        mood: 4,
        energy: 3,
        distractionLevel: 2,
      },
    ],
  }));

  let request;
  replaceMethod(t, axios, "post", async (url, payload) => {
    request = { url, payload };
    return { data: { activitySummary: {} } };
  });

  const res = makeResponse();
  await getAnalyticsSummary({ query: { timezone: "Asia/Kolkata" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(request.url, /\/api\/analytics\/summary$/);
  assert.equal(request.payload.timezone, "Asia/Kolkata");
  assert.equal(request.payload.activities[0].startTime, startTime.toISOString());
  assert.equal(request.payload.activities[0]._id, "activity-id");
  assert.doesNotThrow(() => JSON.stringify(request.payload));
});

test("analytics proxy returns a sanitized unavailable-service response", async (t) => {
  replaceMethod(t, Activity, "find", () => ({ lean: async () => [] }));
  replaceMethod(t, DailyMetric, "find", () => ({ lean: async () => [] }));
  replaceMethod(t, axios, "post", async () => {
    throw new AxiosError("private connection detail", "ECONNREFUSED");
  });
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });

  const res = makeResponse();
  await getAnalyticsClusters({ query: {} }, res);

  assert.equal(res.statusCode, 503);
  assert.match(res.body.message, /Analytics service unavailable/);
  assert.equal(JSON.stringify(res.body).includes("private connection detail"), false);
});
