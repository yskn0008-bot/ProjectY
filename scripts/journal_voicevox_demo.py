#!/usr/bin/env python3
"""Generate one public YOS JOURNAL sample MP3 with local, free VOICEVOX Nemo.

Usage: python scripts/journal_voicevox_demo.py
The engine must be running locally. No API keys, private Notion or user data.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATE = "2026-11-12"
ISSUE = ROOT / "journal" / "editions" / f"{DATE}.json"
TARGET = ROOT / "journal" / "audio" / DATE / "article-0.mp3"
BASE = os.getenv("VOICEVOX_URL", "http://127.0.0.1:50121").rstrip("/")


def request(path: str, data: bytes | None = None, mime: str | None = None) -> bytes:
    headers = {"Content-Type": mime} if mime else {}
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read()


def wait_for_engine() -> list[dict]:
    for _ in range(65):
        try:
            speakers = json.loads(request("/speakers"))
            if isinstance(speakers, list) and speakers:
                return speakers
        except Exception:
            time.sleep(2)
    raise RuntimeError("VOICEVOX Nemo did not become healthy")


def choose_male_speaker(speakers: list[dict]) -> int:
    for speaker in speakers:
        styles = speaker.get("styles", [])
        for style in styles:
            name = str(speaker.get("name", "")) + " " + str(style.get("name", ""))
            if "男声" in name or "男性" in name:
                return int(style["id"])
    raise RuntimeError("No verified male Nemo voice available; refusing to guess a speaker ID")


def make_chunks(article: dict) -> list[str]:
    # Public issue fields only: avoid importing personal data, live pages, or unlicensed article text.
    sections = [
        ("", article["title"]),
        ("", article.get("summary", "")),
        ("この記事が役立つ理由。", article.get("reason", "")),
        ("おすすめの行動。", article.get("action", "")),
        ("注意点。", article.get("caveat", "")),
    ]
    chunks = []
    for heading, text in sections:
        material = (heading + " " + str(text or "")).strip()
        if not material:
            continue
        # Split at Japanese punctuation; keep request sizes small for reliable local synthesis.
        for part in re.split(r"(?<=[。！？])", material):
            part = part.strip()
            if part:
                for i in range(0, len(part), 110):
                    chunks.append(part[i : i + 110])
    return chunks


def main() -> None:
    data = json.loads(ISSUE.read_text(encoding="utf-8"))
    assert data.get("issuedOn") == DATE, "Archive date mismatch"
    article = data["articles"][0]
    chunks = make_chunks(article)
    assert chunks and len(chunks) < 40, "Unreasonable sample length"
    speaker = choose_male_speaker(wait_for_engine())

    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for i, text in enumerate(chunks):
            qs = urllib.parse.urlencode({"text": text, "speaker": speaker})
            query = json.loads(request("/audio_query?" + qs, data=b""))
            query["speedScale"] = 0.98
            query["intonationScale"] = 1.12
            wav = request("/synthesis?" + urllib.parse.urlencode({"speaker": speaker}), data=json.dumps(query).encode(), mime="application/json")
            if not wav.startswith(b"RIFF"):
                raise RuntimeError("VOICEVOX output is not a WAV file")
            path = Path(tmp) / f"{i:03d}.wav"
            path.write_bytes(wav)
            files.append(path)
        inputs = Path(tmp) / "concat.txt"
        inputs.write_text("".join(f"file '{p}'\n" for p in files), encoding="utf-8")
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(inputs), "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "96k", str(TARGET)], check=True)
        assert TARGET.stat().st_size > 4000, "Sample MP3 is empty"
        print(f"Generated {TARGET.relative_to(ROOT)} ({TARGET.stat().st_size} bytes), speaker={speaker}, chunks={len(chunks)}")


if __name__ == "__main__":
    main()
