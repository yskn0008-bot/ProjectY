#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

VOICE_NAME = "#define name Clarity\n"
TEXT_NAME = "#define name Clarity Text\n"
VOICE_INPUT = 'const originalInput = listen("After Pause", "jp-JP")'
TEXT_INPUT = """const textInput = prompt("Clarityに入力", "Text", "")
const originalInput = text("{textInput}")"""


def render(source: str) -> str:
    if source.count(VOICE_NAME) != 1:
        raise ValueError("expected exactly one Clarity name directive")
    if source.count(VOICE_INPUT) != 1:
        raise ValueError("expected exactly one canonical voice input line")
    if "{ShortcutInput}" in source:
        raise ValueError("canonical Clarity must not depend on Shortcut Input")

    rendered = source.replace(VOICE_NAME, TEXT_NAME, 1).replace(VOICE_INPUT, TEXT_INPUT, 1)

    if rendered.count(TEXT_NAME) != 1:
        raise ValueError("text variant name replacement failed")
    if rendered.count(TEXT_INPUT) != 1:
        raise ValueError("text variant input replacement failed")
    if VOICE_INPUT in rendered:
        raise ValueError("voice input survived in text variant")
    return rendered


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.source.read_text(encoding="utf-8")
    args.output.write_text(render(source), encoding="utf-8")


if __name__ == "__main__":
    main()
