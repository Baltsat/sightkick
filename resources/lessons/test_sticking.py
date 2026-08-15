import unittest

from generate import (
    build_notes_mid,
    build_sticking_data,
    build_timeline,
    duplicate_pattern_report,
)


def exercise(exercise_id: str, bars: list[dict], **extra: object) -> dict:
    return {
        "id": exercise_id,
        "time_signature": [4, 4],
        "bars": bars,
        **extra,
    }


class StickingDataTest(unittest.TestCase):
    def test_resolves_authored_hands_and_kick_foot_per_note(self) -> None:
        data = build_sticking_data(
            exercise(
                "01.01",
                [{"S": "xxxx", "K": "x.x."}],
                sticking="RLRL",
            ),
            count_in_bars=1,
            repeat_count=4,
        )

        self.assertEqual(data["version"], 1)
        self.assertEqual(data["lessonId"], "01.01")
        self.assertEqual(data["countInBars"], 1)
        self.assertEqual(data["repeatCount"], 4)
        self.assertEqual(
            data["bars"][0]["notes"],
            [
                {"step": 0, "lane": "K", "symbol": "x", "limb": "right-foot"},
                {"step": 0, "lane": "S", "symbol": "x", "limb": "right-hand"},
                {"step": 1, "lane": "S", "symbol": "x", "limb": "left-hand"},
                {"step": 2, "lane": "K", "symbol": "x", "limb": "right-foot"},
                {"step": 2, "lane": "S", "symbol": "x", "limb": "right-hand"},
                {"step": 3, "lane": "S", "symbol": "x", "limb": "left-hand"},
            ],
        )

    def test_rejects_a_sticking_string_that_does_not_cover_the_bar(self) -> None:
        with self.assertRaisesRegex(
            ValueError, "sticking must contain 4 hand assignments"
        ):
            build_sticking_data(exercise("01.01", [{"S": "xxxx"}], sticking="RLR"))

    def test_note_duplicates_split_when_sticking_differs(self) -> None:
        report = duplicate_pattern_report(
            [
                exercise("03.01", [{"S": "xxxx"}], sticking="RLRL"),
                exercise("03.06", [{"S": "xxxx"}], sticking="RRLL"),
            ]
        )

        self.assertEqual(report["duplicate_groups"], [])

    def test_only_a_named_family_may_share_a_complete_pattern(self) -> None:
        report = duplicate_pattern_report(
            [
                exercise(
                    "03.01",
                    [{"S": "xxxx"}],
                    sticking="RLRL",
                    pattern_family="single-stroke-roll",
                ),
                exercise(
                    "03.02",
                    [{"S": "xxxx"}],
                    sticking="RLRL",
                    pattern_family="single-stroke-roll",
                ),
            ]
        )

        self.assertEqual(
            report["duplicate_groups"],
            [{"family": "single-stroke-roll", "lesson_ids": ["03.01", "03.02"]}],
        )

        with self.assertRaisesRegex(ValueError, "unintentional duplicate pattern"):
            duplicate_pattern_report(
                [
                    exercise("05.01", [{"S": "xxxx"}], sticking="RLRL"),
                    exercise("05.02", [{"S": "xxxx"}], sticking="RLRL"),
                ]
            )

    def test_midi_exposes_accent_and_ghost_flags(self) -> None:
        item = exercise(
            "01.01",
            [{"S": "Xg.."}],
            bpm_target=60,
            sticking="RL",
        )
        midi = build_notes_mid(item, build_timeline(item))

        self.assertIn(b"[ENABLE_CHART_DYNAMICS]", midi)
        self.assertIn(bytes([0x99, 97, 127]), midi)
        self.assertIn(bytes([0x99, 97, 1]), midi)


if __name__ == "__main__":
    unittest.main()
