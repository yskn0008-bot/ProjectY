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
EDITION_DIR = ROOT / "journal" / "editions"
AUDIO_DIR = ROOT / "journal" / "audio"
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
    # Only dated public editions are eligible. Personal/Notion data is never read.
    issues = sorted(EDITION_DIR.glob("????-??-??.json"))
    if not issues:
        raise RuntimeError("No published dated issue available")
    issue_path = issues[-1]
    data = json.loads(issue_path.read_text(encoding="utf-8"))
    date = issue_path.stem
    if data.get("issuedOn") != date:
        raise RuntimeError("Issue date disagrees with filename")
    articles = data.get("articles")
    if not isinstance(articles, list) or not 1 <= len(articles) <= 8:
        raise RuntimeError("Invalid issue length")
    pending = [(i, article, AUDIO_DIR / date / f"article-{i}.mp3")
               for i, article in enumerate(articles)
               if not (AUDIO_DIR / date / f"article-{i}.mp3").is_file()]
    if not pending:
        print(f"All {len(articles)} audio files for {date} already exist")
        return
    speaker = choose_male_speaker(wait_for_engine())
    for index, article, target in pending:
        if not isinstance(article, dict) or not article.get("title"):
            raise RuntimeError(f"Article {index} is missing its title")
        chunks = make_chunks(article)
        if not chunks or len(chunks) > 65:
            raise RuntimeError(f"Invalid narration length: article {index}")
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
                wav_path = Path(tmp) / f"{i:03d}.wav"
                wav_path.write_bytes(wav)
                files.append(wav_path)
            inputs = Path(tmp) / "concat.txt"
            inputs.write_text("".join(f"file '{p}'\n" for p in files), encoding="utf-8")
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(inputs), "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "96k", str(target)], check=True)
            if target.stat().st_size <= 4000:
                raise RuntimeError(f"MP3 too small: {target}")
            print(f"Generated {target.relative_to(ROOT)} ({target.stat().st_size} bytes), speaker={speaker}, chunks={len(chunks)}")


if __name__ == "__main__":
    main()
