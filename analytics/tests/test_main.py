import json
import unittest

from fastapi import HTTPException

from main import (
    AnalyticsPayload,
    _build_day_features,
    analytics_clusters,
    analytics_correlations,
    analytics_summary,
)


def make_payload(count=4, timezone="UTC"):
    activities = []
    daily_metrics = []
    for index in range(count):
        date = f"2026-11-{20 + index:02d}"
        activities.append(
            {
                "title": f"Session {index}",
                "category": "study" if index % 2 == 0 else "coding",
                "startTime": f"{date}T09:00:00.000Z",
                "endTime": f"{date}T09:30:00.000Z",
                "durationMinutes": 30 * (index + 1),
                "focusRating": index + 1,
                "isProductive": index % 2 == 0,
            }
        )
        daily_metrics.append(
            {
                "date": date,
                "sleepHours": 5 + index,
                "mood": index + 1,
                "energy": index + 2,
                "distractionLevel": 5 - index,
            }
        )
    return AnalyticsPayload(
        activities=activities,
        dailyMetrics=daily_metrics,
        timezone=timezone,
    )


class AnalyticsEndpointTests(unittest.TestCase):
    def test_summary_handles_empty_data_without_non_finite_json_values(self):
        result = analytics_summary(AnalyticsPayload())

        self.assertEqual(result["activitySummary"]["totalTrackedMinutes"], 0)
        self.assertIsNone(result["activitySummary"]["averageFocusRating"])
        self.assertEqual(result["dailyMetricsSummary"]["daysRecorded"], 0)
        json.dumps(result, allow_nan=False)

    def test_non_finite_inputs_do_not_produce_non_finite_json(self):
        payload = AnalyticsPayload(
            activities=[
                {
                    "category": "study",
                    "startTime": "2026-11-25T10:00:00Z",
                    "durationMinutes": float("inf"),
                    "focusRating": float("nan"),
                    "isProductive": True,
                }
            ],
            dailyMetrics=[
                {
                    "date": "2026-11-25",
                    "sleepHours": float("inf"),
                    "mood": float("nan"),
                }
            ],
        )

        result = analytics_summary(payload)

        self.assertIsNone(result["activitySummary"]["averageFocusRating"])
        self.assertIsNone(result["dailyMetricsSummary"]["averageSleepHours"])
        json.dumps(result, allow_nan=False)

    def test_summary_uses_activity_and_daily_metric_fields(self):
        result = analytics_summary(make_payload())

        self.assertEqual(result["activitySummary"]["totalTrackedMinutes"], 300)
        self.assertEqual(result["activitySummary"]["totalProductiveMinutes"], 120)
        self.assertEqual(result["activitySummary"]["activityCount"], 4)
        self.assertEqual(result["activitySummary"]["productiveActivityCount"], 2)
        self.assertEqual(result["activitySummary"]["timeByCategory"]["study"], 120)
        self.assertEqual(result["dailyMetricsSummary"]["averageSleepHours"], 6.5)

    def test_correlations_return_pairwise_results_and_non_causal_message(self):
        result = analytics_correlations(make_payload())

        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["correlations"])
        self.assertTrue(
            any(
                item["variable1"] == "sleepHours"
                and item["variable2"] == "mood"
                and item["value"] == 1.0
                for item in result["correlations"]
            )
        )
        self.assertIn("does not prove causation", result["message"])
        json.dumps(result, allow_nan=False)

    def test_correlation_and_clustering_report_insufficient_data(self):
        small_payload = make_payload(count=2)

        correlation_result = analytics_correlations(small_payload)
        cluster_result = analytics_clusters(small_payload)

        self.assertEqual(correlation_result["status"], "insufficient_data")
        self.assertIn("At least 3", correlation_result["message"])
        self.assertEqual(cluster_result["status"], "insufficient_data")
        self.assertIn("at least 4 dates", cluster_result["message"])

    def test_clustering_is_reproducible_and_returns_original_units(self):
        payload = make_payload()
        first_result = analytics_clusters(payload)
        second_result = analytics_clusters(payload)

        self.assertEqual(first_result["status"], "ok")
        self.assertEqual(first_result["clusterCount"], 2)
        self.assertEqual(first_result["days"], second_result["days"])
        self.assertEqual(len(first_result["days"]), 4)
        self.assertTrue(
            all(
                "trackedMinutes" in cluster["averages"]
                and "sleepHours" in cluster["averages"]
                for cluster in first_result["clusters"]
            )
        )
        self.assertIn("not rankings of good or bad days", first_result["message"])
        json.dumps(first_result, allow_nan=False)

    def test_activity_dates_are_grouped_in_the_requested_local_timezone(self):
        payload = AnalyticsPayload(
            timezone="Asia/Kolkata",
            activities=[
                {
                    "startTime": "2026-11-25T18:45:00.000Z",
                    "durationMinutes": 30,
                    "focusRating": 4,
                    "isProductive": True,
                }
            ],
            dailyMetrics=[
                {
                    "date": "2026-11-26",
                    "sleepHours": 7,
                    "mood": 4,
                    "energy": 4,
                    "distractionLevel": 2,
                }
            ],
        )

        features = _build_day_features(payload)

        self.assertEqual(features.iloc[0]["date"], "2026-11-26")
        self.assertEqual(features.iloc[0]["trackedMinutes"], 30)

    def test_invalid_timezone_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            analytics_correlations(AnalyticsPayload(timezone="Not/AZone"))

        self.assertEqual(error.exception.status_code, 422)

    def test_malformed_records_are_treated_as_missing_for_date_analysis(self):
        payload = AnalyticsPayload(
            activities=[{"category": "study", "durationMinutes": 20}],
            dailyMetrics=[{"sleepHours": 7}],
        )

        self.assertEqual(
            analytics_correlations(payload)["status"],
            "insufficient_data",
        )
        self.assertEqual(
            analytics_clusters(payload)["status"],
            "insufficient_data",
        )


if __name__ == "__main__":
    unittest.main()
