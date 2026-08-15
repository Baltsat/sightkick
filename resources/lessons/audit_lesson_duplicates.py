import argparse
import json
from pathlib import Path

from generate import duplicate_pattern_report, iter_exercises, load_curriculum


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--curriculum",
        type=Path,
        default=Path(__file__).resolve().parent / "curriculum.yaml",
    )
    args = parser.parse_args()
    exercises = [
        exercise for _, _, exercise in iter_exercises(load_curriculum(args.curriculum))
    ]
    try:
        report = duplicate_pattern_report(exercises)
    except (OSError, ValueError) as error:
        print(f"lesson duplicate audit failed: {error}")
        return 1
    print("lesson duplicate audit passed")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
