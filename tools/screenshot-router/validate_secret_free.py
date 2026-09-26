#!/usr/bin/env python3
"""Fail closed if secret-free Shortcut source appears to embed credentials."""
from __future__ import annotations

import re
import sys
from pathlib import Path

PATTERNS = {
    "OpenAI-style secret": re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "Slack token": re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    "Bearer credential": re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]{16,}", re.I),
    "Private key": re.compile(r"BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY"),
}


def main() -> int:
    failed = False
    for name in sys.argv[1:]:
        path = Path(name)
        text = path.read_text(encoding="utf-8")
        for label, pattern in PATTERNS.items():
            if pattern.search(text):
                print(f"ERROR: {path}: possible {label}", file=sys.stderr)
                failed = True
    if not failed:
        print("OK: screenshot-router source is secret-free by static scan")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
