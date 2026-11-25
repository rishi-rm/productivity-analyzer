import dotenv from "dotenv";
import mongoose from "mongoose";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Activity from "../models/Activity.js";
import DailyMetric from "../models/DailyMetric.js";

export const DEMO_DATABASE_NAME = "productivity_analyzer_demo";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const KOLKATA_TIME_ZONE = "Asia/Kolkata";
const KOLKATA_UTC_OFFSET_MINUTES = 5 * 60 + 30;
const RANDOM_SEED = 0x5eed1234;
const ACTIVITIES_PER_DAY = 4;

const activityTitles = {
  study: [
    "Review lecture notes",
    "Practice problem set",
    "Read a research paper",
    "Revise flashcards",
    "Outline a study topic",
  ],
  coding: [
    "Build an API endpoint",
    "Refactor a dashboard component",
    "Debug form validation",
    "Write unit tests",
    "Explore a sample dataset",
  ],
  work: [
    "Plan weekly priorities",
    "Prepare a project update",
    "Review project documents",
    "Draft a project proposal",
    "Organize work tasks",
  ],
  exercise: [
    "Take a brisk walk",
    "Do a strength workout",
    "Practice yoga and mobility",
    "Go for a cycling session",
  ],
  personal: [
    "Prepare a simple meal",
    "Organize the workspace",
    "Plan household errands",
    "Take care of personal admin",
  ],
  entertainment: [
    "Watch an episode",
    "Read for fun",
    "Play a casual game",
    "Listen to a podcast",
  ],
  rest: [
    "Take a quiet break",
    "Have a short rest",
    "Wind down without screens",
    "Take a restorative pause",
  ],
  other: [
    "Handle an unplanned task",
    "Sort out a small errand",
    "Review miscellaneous notes",
    "Take care of a quick follow-up",
  ],
};

const notes = [
  "Synthetic demo data: a focused, time-boxed session.",
  "Synthetic demo data: a short session with a screen break afterward.",
  "Synthetic demo data: kept the task manageable and steady.",
  "Synthetic demo data: left a little time to reset before the next task.",
  "Synthetic demo data: an ordinary part of a varied day.",
];

const focusRatingsByPattern = {
  focused: [3, 4, 4, 5, 5],
  mixed: [2, 3, 3, 4, 4],
  distracted: [1, 2, 2, 3, 4],
};

const metricBaselines = {
  focused: { sleep: 7.6, mood: 4, energy: 4, distraction: 2 },
  mixed: { sleep: 7.1, mood: 3, energy: 3, distraction: 3 },
  distracted: { sleep: 6.4, mood: 2, energy: 2, distraction: 4 },
};

function createRandomGenerator(seed = RANDOM_SEED) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function randomInteger(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function choose(random, values) {
  return values[Math.floor(random() * values.length)];
}

function shuffle(random, values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, 0, index);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getDateInKolkata(date) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((parts, part) => {
      if (part.type !== "literal") parts[part.type] = part.value;
      return parts;
    }, {});

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function getLocalMinuteOfDay(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOLKATA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((values, part) => {
      if (part.type !== "literal") values[part.type] = part.value;
      return values;
    }, {});

  return Number(parts.hour) * 60 + Number(parts.minute);
}

function shiftDate(dateString, dayOffset) {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function toKolkataInstant(dateString, minuteOfDay) {
  const [year, month, day] = dateString.split("-").map(Number);
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const utcMilliseconds =
    Date.UTC(year, month - 1, day, hours, minutes) -
    KOLKATA_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMilliseconds);
}

function createDailyMetric(date, pattern, random) {
  const baseline = metricBaselines[pattern];
  const sleepHours = clamp(
    baseline.sleep + randomInteger(random, -12, 12) / 10,
    4.5,
    9.5
  );
  const mood = clamp(
    baseline.mood + randomInteger(random, -1, 1),
    1,
    5
  );
  const energy = clamp(
    baseline.energy + randomInteger(random, -1, 1),
    1,
    5
  );
  const distractionLevel = clamp(
    baseline.distraction + randomInteger(random, -1, 1),
    1,
    5
  );

  return {
    date,
    sleepHours: Math.round(sleepHours * 10) / 10,
    mood,
    energy,
    distractionLevel,
  };
}

function getCategoriesForDay(dayIndex, random) {
  const coreCategories = ["study", "coding", "work"];
  const firstCore = coreCategories[
    (dayIndex + randomInteger(random, 0, coreCategories.length - 1)) %
      coreCategories.length
  ];
  const secondCore = coreCategories[
    (dayIndex + 1 + randomInteger(random, 0, coreCategories.length - 1)) %
      coreCategories.length
  ];
  const supportingCategories = ["exercise", "personal", "other"];
  const relaxingCategories = ["entertainment", "rest", "personal"];

  return [
    firstCore,
    secondCore,
    supportingCategories[dayIndex % supportingCategories.length],
    relaxingCategories[
      Math.floor(dayIndex / 3) % relaxingCategories.length
    ],
  ];
}

function getDurationMinutes(category, pattern, random) {
  if (["study", "coding", "work"].includes(category)) {
    const ranges = {
      focused: [50, 105],
      mixed: [35, 85],
      distracted: [25, 70],
    };
    const [minimum, maximum] = ranges[pattern];
    return randomInteger(random, minimum, maximum);
  }

  if (category === "exercise") return randomInteger(random, 25, 60);
  if (category === "entertainment" || category === "rest") {
    return randomInteger(random, 20, 75);
  }
  return randomInteger(random, 20, 60);
}

function getProductivityProbability(category, pattern) {
  const baseline = { focused: 0.8, mixed: 0.53, distracted: 0.27 }[pattern];
  if (["study", "coding", "work"].includes(category)) {
    return Math.min(0.96, baseline + 0.12);
  }
  if (category === "exercise") return Math.min(0.9, baseline + 0.08);
  if (category === "entertainment" || category === "rest") {
    return Math.max(0.05, baseline - 0.3);
  }
  return baseline;
}

function createActivity(date, category, pattern, cursor, random) {
  const durationMinutes = getDurationMinutes(category, pattern, random);
  const startTime = toKolkataInstant(date, cursor);
  const endTime = toKolkataInstant(date, cursor + durationMinutes);
  const isProductive =
    random() < getProductivityProbability(category, pattern);
  let focusRating = choose(random, focusRatingsByPattern[pattern]);

  if (isProductive && random() < 0.35) {
    focusRating = clamp(focusRating + 1, 1, 5);
  } else if (!isProductive && random() < 0.35) {
    focusRating = clamp(focusRating - 1, 1, 5);
  }

  return {
    title: `Demo: ${choose(random, activityTitles[category])}`,
    category,
    startTime,
    endTime,
    durationMinutes: Math.round(
      (endTime.getTime() - startTime.getTime()) / 60_000
    ),
    focusRating,
    isProductive,
    notes: choose(random, notes),
  };
}

export function generateDemoDataset(referenceTime = new Date()) {
  if (
    !(referenceTime instanceof Date) ||
    Number.isNaN(referenceTime.getTime())
  ) {
    throw new TypeError("referenceTime must be a valid Date");
  }

  const random = createRandomGenerator();
  const today = getDateInKolkata(referenceTime);
  const includesTodayActivities =
    getLocalMinuteOfDay(referenceTime) >= 19 * 60;
  const patterns = shuffle(random, [
    ...Array(10).fill("focused"),
    ...Array(10).fill("mixed"),
    ...Array(10).fill("distracted"),
  ]);
  const dailyMetrics = [];
  const activities = [];

  for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
    const date = shiftDate(today, dayIndex - 29);
    const pattern = patterns[dayIndex];
    dailyMetrics.push(createDailyMetric(date, pattern, random));

    // Avoid creating future sessions when the current local day is still underway.
    if (date === today && !includesTodayActivities) continue;

    const dayCategories = getCategoriesForDay(dayIndex, random);
    let cursor = 8 * 60 + randomInteger(random, 0, 90);
    for (const category of dayCategories) {
      const activity = createActivity(date, category, pattern, cursor, random);
      activities.push(activity);
      cursor += activity.durationMinutes + randomInteger(random, 15, 45);
    }
  }

  return { activities, dailyMetrics };
}

export function assertDemoDatabaseUri(uri) {
  if (typeof uri !== "string" || uri.length === 0) {
    throw new Error("MONGODB_URI is required to seed demo data.");
  }

  let parsedUri;
  try {
    parsedUri = new URL(uri);
  } catch {
    throw new Error("MONGODB_URI must be a valid MongoDB connection URI.");
  }

  if (
    parsedUri.protocol !== "mongodb:" &&
    parsedUri.protocol !== "mongodb+srv:"
  ) {
    throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://.");
  }

  let uriDatabaseName;
  try {
    uriDatabaseName = decodeURIComponent(
      parsedUri.pathname.replace(/^\/+/, "").split("/")[0]
    );
  } catch {
    throw new Error("MONGODB_URI contains an invalid database name.");
  }

  if (uriDatabaseName !== DEMO_DATABASE_NAME) {
    throw new Error(
      `Refusing to connect: MONGODB_URI must target "${DEMO_DATABASE_NAME}". No database was contacted.`
    );
  }

  const databaseNameOverrides = parsedUri.searchParams.getAll("dbName");
  if (
    databaseNameOverrides.length > 1 ||
    databaseNameOverrides.some((name) => name !== DEMO_DATABASE_NAME)
  ) {
    throw new Error(
      `Refusing to connect: any dbName URI option must also be "${DEMO_DATABASE_NAME}". No database was contacted.`
    );
  }

  return uriDatabaseName;
}

export function assertConnectedDatabaseName(databaseName) {
  if (databaseName !== DEMO_DATABASE_NAME) {
    throw new Error(
      `Refusing to seed: connected database is not "${DEMO_DATABASE_NAME}". No records were cleared.`
    );
  }
}

export async function seedDemoData() {
  dotenv.config({ path: resolve(SCRIPT_DIRECTORY, "../.env") });
  const mongoUri = process.env.MONGODB_URI;
  assertDemoDatabaseUri(mongoUri);

  if (
    mongoose.connection.readyState !== 0 &&
    mongoose.connection.name !== DEMO_DATABASE_NAME
  ) {
    throw new Error(
      `Refusing to seed: an existing connection targets "${mongoose.connection.name}".`
    );
  }

  const dataset = generateDemoDataset();

  try {
    await mongoose.connect(mongoUri);
    assertConnectedDatabaseName(mongoose.connection.name);

    await Activity.deleteMany({});
    await DailyMetric.deleteMany({});
    const insertedActivities = await Activity.insertMany(dataset.activities);
    const insertedMetrics = await DailyMetric.insertMany(dataset.dailyMetrics);

    console.log("Synthetic demo data seeded successfully.");
    console.log(
      `Inserted ${insertedActivities.length} demo activity records and ${insertedMetrics.length} daily metric records into ${DEMO_DATABASE_NAME}.`
    );
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

const isMainModule =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  seedDemoData().catch((error) => {
    console.error(`Demo seed failed: ${error.message}`);
    process.exitCode = 1;
  });
}
