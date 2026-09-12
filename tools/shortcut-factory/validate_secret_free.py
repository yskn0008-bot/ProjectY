#!/usr/bin/env python3
"""Fail closed if Shortcut source appears to embed credentials or private tokens.

This is intentionally conservative because HubSign is a third-party signing path.
Runtime user content is allowed because it is not present in source artifacts.
"""
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
    if len(sys.argv) < 2:
        print("usage: validate_secret_free.py <file> [file...]", file=sys.stderr)
        return 2

    failed = False
    for name in sys.argv[1:]:
        path = Path(name)
        text = path.read_text(encoding="utf-8")
        for label, pattern in PATTERNS.items():
            if pattern.search(text):
                print(f"ERROR: {path}: possible {label}", file=sys.stderr)
                failed = True
        if not failed:
            print(f"OK: {path} is secret-free by static scan")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
