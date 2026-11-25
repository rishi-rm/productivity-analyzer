import assert from "node:assert/strict";
import { test } from "node:test";
import Activity from "../models/Activity.js";
import DailyMetric from "../models/DailyMetric.js";
import {
  assertConnectedDatabaseName,
  assertDemoDatabaseUri,
  DEMO_DATABASE_NAME,
  generateDemoDataset,
} from "../scripts/seedDemoData.js";

const referenceTime = new Date("2026-11-26T14:00:00.000Z");

function getKolkataDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((values, part) => {
      if (part.type !== "literal") values[part.type] = part.value;
      return values;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

test("demo dataset is reproducible and covers 30 consecutive local dates", () => {
  const first = generateDemoDataset(referenceTime);
  const second = generateDemoDataset(referenceTime);

  assert.deepEqual(first, second);
  assert.equal(first.activities.length, 120);
  assert.equal(first.dailyMetrics.length, 30);
  assert.equal(first.dailyMetrics[0].date, "2026-10-28");
  assert.equal(first.dailyMetrics.at(-1).date, "2026-11-26");

  for (let index = 1; index < first.dailyMetrics.length; index += 1) {
    const previousDate = new Date(
      `${first.dailyMetrics[index - 1].date}T12:00:00.000Z`
    );
    previousDate.setUTCDate(previousDate.getUTCDate() + 1);
    assert.equal(
      first.dailyMetrics[index].date,
      previousDate.toISOString().slice(0, 10)
    );
  }
});

test("early-in-the-day generation still has 30 metrics and avoids future sessions", () => {
  const earlyReferenceTime = new Date("2026-11-26T00:00:00.000Z");
  const dataset = generateDemoDataset(earlyReferenceTime);

  assert.equal(dataset.dailyMetrics.length, 30);
  assert.equal(dataset.activities.length, 116);
  assert.ok(
    dataset.activities.every(
      (activity) => getKolkataDate(activity.startTime) !== "2026-11-26"
    )
  );
});

test("generated records satisfy both schemas and activities do not overlap locally", async () => {
  const { activities, dailyMetrics } = generateDemoDataset(referenceTime);
  const activitiesByDate = new Map();
  const usedCategories = new Set(activities.map((activity) => activity.category));

  assert.deepEqual(
    usedCategories,
    new Set(Activity.schema.path("category").enumValues)
  );

  for (const activity of activities) {
    await new Activity(activity).validate();
    assert.equal(activity.title.startsWith("Demo: "), true);
    assert.ok(Number.isInteger(activity.focusRating));
    assert.ok(activity.focusRating >= 1 && activity.focusRating <= 5);
    assert.ok(
      activity.durationMinutes >= 1 &&
        activity.durationMinutes ===
          (activity.endTime.getTime() - activity.startTime.getTime()) / 60_000
    );
    assert.equal(
      activity.notes.startsWith("Synthetic demo data: "),
      true
    );

    const localDate = getKolkataDate(activity.startTime);
    assert.equal(getKolkataDate(activity.endTime), localDate);
    const dayActivities = activitiesByDate.get(localDate) ?? [];
    dayActivities.push(activity);
    activitiesByDate.set(localDate, dayActivities);
  }

  for (const dayActivities of activitiesByDate.values()) {
    dayActivities.sort((left, right) => left.startTime - right.startTime);
    for (let index = 1; index < dayActivities.length; index += 1) {
      assert.ok(
        dayActivities[index - 1].endTime <= dayActivities[index].startTime
      );
    }
  }

  assert.equal(new Set(dailyMetrics.map((metric) => metric.date)).size, 30);
  for (const metric of dailyMetrics) {
    await new DailyMetric(metric).validate();
    assert.ok(metric.sleepHours >= 0 && metric.sleepHours <= 24);
    assert.ok(
      [metric.mood, metric.energy, metric.distractionLevel].every(
        (rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5
      )
    );
  }
});

test("generated daily patterns have enough varied features for analysis", () => {
  const { activities, dailyMetrics } = generateDemoDataset(referenceTime);
  const activityFeatures = dailyMetrics.map((metric) => {
    const dateActivities = activities.filter(
      (activity) => getKolkataDate(activity.startTime) === metric.date
    );
    const trackedMinutes = dateActivities.reduce(
      (total, activity) => total + activity.durationMinutes,
      0
    );
    const productiveMinutes = dateActivities.reduce(
      (total, activity) =>
        total +
        (activity.isProductive ? activity.durationMinutes : 0),
      0
    );

    return {
      trackedMinutes,
      productiveMinutes,
      averageFocus:
        dateActivities.length === 0
          ? null
          : dateActivities.reduce(
              (total, activity) => total + activity.focusRating,
              0
            ) / dateActivities.length,
      metric,
    };
  });

  const completeDays = activityFeatures.filter(
    (features) =>
      features.trackedMinutes > 0 &&
      features.averageFocus !== null &&
      features.metric.sleepHours !== null
  );
  const distinctFeatureRows = new Set(
    completeDays.map((features) =>
      [
        features.trackedMinutes,
        features.productiveMinutes,
        features.averageFocus,
        features.metric.sleepHours,
        features.metric.mood,
        features.metric.energy,
        features.metric.distractionLevel,
      ].join("|")
    )
  );

  assert.ok(completeDays.length >= 29);
  assert.ok(distinctFeatureRows.size >= 10);
  for (const field of [
    "sleepHours",
    "mood",
    "energy",
    "distractionLevel",
  ]) {
    assert.ok(
      new Set(dailyMetrics.map((metric) => metric[field])).size >= 3,
      `${field} should vary across the generated dates`
    );
  }
});

test("database safety guard accepts only the dedicated demo database", () => {
  const safeUri = `mongodb://127.0.0.1:27017/${DEMO_DATABASE_NAME}`;
  assert.equal(assertDemoDatabaseUri(safeUri), DEMO_DATABASE_NAME);
  assert.equal(
    assertDemoDatabaseUri(`${safeUri}?dbName=${DEMO_DATABASE_NAME}`),
    DEMO_DATABASE_NAME
  );
  assert.throws(
    () =>
      assertDemoDatabaseUri(
        "mongodb://127.0.0.1:27017/productivity_analyzer"
      ),
    /No database was contacted/
  );
  assert.throws(
    () =>
      assertDemoDatabaseUri(
        `${safeUri}?dbName=productivity_analyzer`
      ),
    /No database was contacted/
  );
  assert.throws(
    () => assertConnectedDatabaseName("productivity_analyzer"),
    /No records were cleared/
  );
  assert.doesNotThrow(() =>
    assertConnectedDatabaseName(DEMO_DATABASE_NAME)
  );
});
