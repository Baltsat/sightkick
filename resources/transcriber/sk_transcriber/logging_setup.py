"""Logging configuration — everything goes to stderr, never stdout.

stdout is reserved exclusively for ``__SK_EVENT__`` protocol lines (see
events.py); any library or our own code that logs must be routed to stderr
so the Electron caller's stdout parser never sees noise.
"""

from __future__ import annotations

import logging
import sys


def configure_logging(verbose: bool = False) -> None:
    handler = logging.StreamHandler(stream=sys.stderr)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)-7s %(name)s: %(message)s", "%H:%M:%S"
        )
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if verbose else logging.INFO)

    # Quiet noisy third-party loggers unless verbose.
    for noisy in ("urllib3", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(
            logging.WARNING if not verbose else logging.DEBUG
        )

    # numba's DEBUG output is a raw bytecode-instruction dump — never useful
    # here, even with --verbose. It is normally moot anyway since run.sh
    # sets NUMBA_DISABLE_JIT=1, but keep this as a second line of defense.
    logging.getLogger("numba").setLevel(logging.WARNING)
