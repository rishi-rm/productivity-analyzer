from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

app = FastAPI(
    title="Productivity Pattern Analyzer",
    description="Data science service for productivity analysis",
    version="1.0.0",
)


class AnalyticsPayload(BaseModel):
    activities: list[dict[str, Any]] = Field(default_factory=list)
    dailyMetrics: list[dict[str, Any]] = Field(default_factory=list)
    timezone: str = "UTC"


@app.get("/")
def root():
    return {"message": "Productivity Analytics Service"}


@app.get("/api/health")
def health():
    return {"status": "OK", "service": "analytics"}


def _numeric_column(frame: pd.DataFrame, name: str) -> pd.Series:
    if name not in frame:
        return pd.Series(np.nan, index=frame.index, dtype="float64")

    return pd.to_numeric(frame[name], errors="coerce").replace(
        [np.inf, -np.inf], np.nan
    )


def _finite_number(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None

    number = float(value)
    return number if np.isfinite(number) else None


def _round_number(value: Any) -> float | None:
    number = _finite_number(value)
    return round(number, 2) if number is not None else None


def _prepare_daily_activity_summary(
    activities: list[dict[str, Any]],
    timezone: ZoneInfo,
) -> pd.DataFrame:
    frame = pd.DataFrame(activities)
    if frame.empty or "startTime" not in frame:
        return pd.DataFrame(
            columns=["date", "trackedMinutes", "productiveMinutes", "focusRating"]
        )

    # Group activity instants in the user's timezone to match date-only daily metrics.
    frame["date"] = (
        pd.to_datetime(frame["startTime"], errors="coerce", utc=True)
        .dt.tz_convert(timezone)
        .dt.strftime("%Y-%m-%d")
    )
    frame["durationMinutes"] = _numeric_column(frame, "durationMinutes")
    frame["focusRating"] = _numeric_column(frame, "focusRating")
    productive = frame.get(
        "isProductive", pd.Series(False, index=frame.index)
    ).eq(True).fillna(False)
    frame["productiveMinutes"] = np.where(
        productive,
        frame["durationMinutes"],
        np.where(frame["durationMinutes"].notna(), 0.0, np.nan),
    )
    frame = frame.dropna(subset=["date"])

    return (
        frame.groupby("date", as_index=False)
        .agg(
            trackedMinutes=(
                "durationMinutes",
                lambda values: values.sum(min_count=1),
            ),
            productiveMinutes=(
                "productiveMinutes",
                lambda values: values.sum(min_count=1),
            ),
            focusRating=("focusRating", "mean"),
        )
        .sort_values("date")
        .reset_index(drop=True)
    )


def _prepare_daily_metrics(daily_metrics: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(daily_metrics)
    metric_fields = ["sleepHours", "mood", "energy", "distractionLevel"]
    if frame.empty or "date" not in frame:
        return pd.DataFrame(columns=["date", *metric_fields])

    frame["date"] = pd.to_datetime(frame["date"], errors="coerce").dt.strftime(
        "%Y-%m-%d"
    )
    for field in metric_fields:
        frame[field] = _numeric_column(frame, field)

    return frame.dropna(subset=["date"])[["date", *metric_fields]]


def _build_day_features(payload: AnalyticsPayload) -> pd.DataFrame:
    try:
        timezone = ZoneInfo(payload.timezone)
    except (ValueError, ZoneInfoNotFoundError) as error:
        raise HTTPException(
            status_code=422,
            detail="timezone must be a valid IANA timezone",
        ) from error

    activity_days = _prepare_daily_activity_summary(payload.activities, timezone)
    metric_days = _prepare_daily_metrics(payload.dailyMetrics)
    return metric_days.merge(activity_days, on="date", how="outer").sort_values(
        "date"
    )


@app.post("/api/analytics/summary")
def analytics_summary(payload: AnalyticsPayload):
    activities = pd.DataFrame(payload.activities)
    durations = _numeric_column(activities, "durationMinutes")
    focus_ratings = _numeric_column(activities, "focusRating")
    productive = activities.get(
        "isProductive", pd.Series(False, index=activities.index)
    ).eq(True).fillna(False)

    productive_durations = durations[productive & durations.notna()]
    category_data = pd.DataFrame(
        {
            "category": activities.get(
                "category", pd.Series(index=activities.index, dtype="object")
            ),
            "durationMinutes": durations,
        }
    ).dropna(subset=["category", "durationMinutes"])
    time_by_category = {
        str(category): _round_number(minutes) or 0
        for category, minutes in category_data.groupby("category")[
            "durationMinutes"
        ].sum().items()
    }

    daily_metrics = pd.DataFrame(payload.dailyMetrics)

    def average_for(field: str) -> float | None:
        return _round_number(_numeric_column(daily_metrics, field).mean())

    return {
        "activitySummary": {
            "totalTrackedMinutes": _round_number(durations.sum()) or 0,
            "totalProductiveMinutes": _round_number(productive_durations.sum()) or 0,
            "averageActivityDurationMinutes": _round_number(durations.mean()),
            "averageFocusRating": _round_number(focus_ratings.mean()),
            "activityCount": len(payload.activities),
            "productiveActivityCount": int(productive.sum()),
            "timeByCategory": time_by_category,
        },
        "dailyMetricsSummary": {
            "averageSleepHours": average_for("sleepHours"),
            "averageMood": average_for("mood"),
            "averageEnergy": average_for("energy"),
            "averageDistractionLevel": average_for("distractionLevel"),
            "daysRecorded": len(payload.dailyMetrics),
        },
    }


@app.post("/api/analytics/correlations")
def analytics_correlations(payload: AnalyticsPayload):
    variables = [
        "sleepHours",
        "mood",
        "energy",
        "distractionLevel",
        "focusRating",
        "productiveMinutes",
    ]
    days = _build_day_features(payload)
    observations = int(days[variables].notna().any(axis=1).sum())
    base_message = (
        "Correlation does not prove causation; these are exploratory relationships "
        "between recorded days."
    )

    if observations < 3:
        return {
            "status": "insufficient_data",
            "message": f"{base_message} At least 3 recorded dates are needed.",
            "observations": observations,
            "correlations": [],
        }

    correlation_matrix = days[variables].corr(method="pearson", min_periods=3)
    correlations = []
    for first_index, first in enumerate(variables):
        for second in variables[first_index + 1 :]:
            paired_observations = int(days[[first, second]].dropna().shape[0])
            value = correlation_matrix.loc[first, second]
            if paired_observations < 3 or pd.isna(value) or not np.isfinite(value):
                continue
            correlations.append(
                {
                    "variable1": first,
                    "variable2": second,
                    "value": round(float(value), 4),
                    "observations": paired_observations,
                }
            )

    if not correlations:
        return {
            "status": "insufficient_data",
            "message": (
                f"{base_message} At least 3 paired, non-constant values are needed "
                "for a correlation."
            ),
            "observations": observations,
            "correlations": [],
        }

    return {
        "status": "ok",
        "message": base_message,
        "observations": observations,
        "correlations": correlations,
    }


@app.post("/api/analytics/clusters")
def analytics_clusters(payload: AnalyticsPayload):
    feature_names = [
        "trackedMinutes",
        "productiveMinutes",
        "focusRating",
        "sleepHours",
        "mood",
        "energy",
        "distractionLevel",
    ]
    days = _build_day_features(payload)
    days[feature_names] = days[feature_names].replace([np.inf, -np.inf], np.nan)

    # Keep only complete dates instead of inventing values for unrecorded fields.
    valid_days = days.dropna(subset=feature_names).reset_index(drop=True)
    if len(valid_days) < 4:
        return {
            "status": "insufficient_data",
            "message": (
                f"Clustering needs at least 4 dates with activity and daily metric "
                f"features; found {len(valid_days)}."
            ),
            "features": feature_names,
            "days": [],
            "clusters": [],
        }

    feature_values = valid_days[feature_names].to_numpy(dtype=float)
    distinct_days = np.unique(feature_values, axis=0).shape[0]
    if distinct_days < 2:
        return {
            "status": "insufficient_data",
            "message": "Clustering needs at least 2 distinct recorded day patterns.",
            "features": feature_names,
            "days": [],
            "clusters": [],
        }

    cluster_count = min(3, len(valid_days) // 2, distinct_days)
    scaled_values = StandardScaler().fit_transform(feature_values)
    labels = KMeans(
        n_clusters=cluster_count,
        random_state=42,
        n_init=10,
    ).fit_predict(scaled_values)

    valid_days["cluster"] = labels
    day_results = [
        {"date": row.date, "cluster": int(row.cluster)}
        for row in valid_days[["date", "cluster"]].itertuples(index=False)
    ]
    cluster_summaries = []
    for cluster in sorted(valid_days["cluster"].unique()):
        members = valid_days[valid_days["cluster"] == cluster]
        averages = {
            feature: _round_number(members[feature].mean())
            for feature in feature_names
        }
        cluster_summaries.append(
            {
                "cluster": int(cluster),
                "dayCount": int(len(members)),
                "averages": averages,
            }
        )

    return {
        "status": "ok",
        "message": (
            "Clusters group similar recorded days. They are descriptive groups, "
            "not rankings of good or bad days."
        ),
        "clusterCount": cluster_count,
        "features": feature_names,
        "days": day_results,
        "clusters": cluster_summaries,
    }
