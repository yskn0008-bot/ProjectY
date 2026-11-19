#!/usr/bin/env python3
"""Build an evidence-limited YOS TAXI public research snapshot.

Only public official/authority-managed sources. No private shift/location data.
Each source fails closed and does not become an assertion of taxi demand.
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

JST = dt.timezone(dt.timedelta(hours=9))
UTC = dt.timezone.utc
NOW = lambda: dt.datetime.now(UTC)
FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/471000.json"
NAHA_RSS_URL = "https://www.city.naha.okinawa.jp/news.rss"
NAHA_RSS_INFO = "https://www.city.naha.okinawa.jp/about/rss.html"
CRUISE_API = "https://data.bodik.jp/api/3/action/package_show?id=470007_okinawa-cruise"
CRUISE_PAGE = "https://data.bodik.jp/dataset/470007_okinawa-cruise"
SNAPSHOT_URL = "https://yskn0008-bot.github.io/ProjectY/taxi/research-feed.json"
OUTPUT = Path(__file__).with_name("research-feed.json")
HEADERS = {"User-Agent": "YOS-TAXI-public-source-check/1.0 (+https://github.com/yskn0008-bot/ProjectY)", "Accept": "application/json, application/xml, text/xml, application/rss+xml, */*"}
KEYWORDS = ("イベント", "催し", "祭", "交通", "道路", "通行止め", "迂回", "規制", "運行", "運休", "渋滞", "台風", "大雨", "暴風", "観光", "コンサート", "花火", "マラソン", "事故", "バス")
JST_FORMAT = "%Y-%m-%d %H:%M JST"


def iso(value: dt.datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z") if value else None


def parse_time(s: str | None) -> dt.datetime | None:
    if not isinstance(s, str) or not s.strip():
        return None
    try:
        value = dt.datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
    except ValueError:
        try:
            value = email.utils.parsedate_to_datetime(s)
        except (ValueError, TypeError, IndexError):
            return None
    return value.astimezone(UTC) if value.tzinfo else None


def safe_url(s: str, *, domains: tuple[str, ...]) -> bool:
    try:
        u = urllib.parse.urlsplit(s)
        return u.scheme == "https" and (u.hostname or "") in domains and not u.username and not u.password
    except (TypeError, ValueError):
        return False


def fetch(url: str, limit: int = 450_000) -> bytes:
    """Do not follow HTTP redirects into an unrelated domain."""
    if not safe_url(url, domains=("www.jma.go.jp", "www.city.naha.okinawa.jp", "data.bodik.jp", "yskn0008-bot.github.io")):
        raise ValueError("unexpected source domain")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=9) as response:
        final = response.geturl()
        if not safe_url(final, domains=("www.jma.go.jp", "www.city.naha.okinawa.jp", "data.bodik.jp", "yskn0008-bot.github.io")):
            raise ValueError("redirected to unapproved domain")
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("source response too large")
        return data


def source_error(source_id: str, name: str, url: str, checked: dt.datetime, reason: str) -> dict:
    return {"id": source_id, "name": name, "url": url, "status": "error", "checkedAt": iso(checked),
            "publishedAt": None, "summary": "公式情報を取得できませんでした。", "detail": reason[:180], "items": []}


def forecast(raw: bytes, checked: dt.datetime) -> dict:
    obj = json.loads(raw)
    if not isinstance(obj, list) or not obj or not isinstance(obj[0], dict):
        raise ValueError("JMA structure")
    root = obj[0]
    issued = parse_time(root.get("reportDatetime"))
    if root.get("publishingOffice") != "沖縄気象台" or not issued:
        raise ValueError("JMA origin/date missing")
    if (issued - checked).total_seconds() > 600:
        raise ValueError("JMA publication time is in the future")
    series = root.get("timeSeries") or []
    if not series or not isinstance(series[0], dict):
        raise ValueError("JMA time series missing")
    periods = series[0].get("timeDefines") or []
    areas = series[0].get("areas") or []
    target = next((a for a in areas if isinstance(a, dict) and a.get("area", {}).get("code") == "471010"), None)
    if not target or len(periods) != len(target.get("weathers") or []):
        raise ValueError("JMA target region/period mismatch")
    values = [(parse_time(t), v) for t, v in zip(periods, target["weathers"])]
    values = [(t, v) for t, v in values if t and isinstance(v, str) and v.strip()]
    if not values:
        raise ValueError("JMA forecast not interpretable")
    values.sort(key=lambda x: x[0])
    active = next((v for t, v in reversed(values) if t <= checked), None)
    if active is None:
        active = values[0][1]
    age = int((checked - issued).total_seconds() // 60)
    status = "ok" if 0 <= age <= 720 else "stale"
    return {"id": "jma", "name": "気象庁｜本島中南部の予報", "url": FORECAST_URL,
            "checkedAt": iso(checked), "publishedAt": iso(issued), "status": status,
            "summary": (active[:170] if status == "ok" else "発表から12時間以上経過。予報の再確認が必要です。"),
            "detail": f"発表から{max(0, age)}分。予報であり降雨実況・営業需要ではありません。", "items": []}


def naha_news(raw: bytes, checked: dt.datetime) -> dict:
    root = ET.fromstring(raw)
    items: list[dict] = []
    for node in root.findall(".//item"):
        title = (node.findtext("title") or "").strip()
        url = (node.findtext("link") or "").strip()
        published = parse_time(node.findtext("pubDate") or node.findtext("date"))
        if not title or not url or not safe_url(url, domains=("www.city.naha.okinawa.jp",)):
            continue
        if not published or not (-600 <= (checked - published).total_seconds() <= 7 * 86400):
            continue
        if not any(word in title for word in KEYWORDS):
            continue
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
        items.append({"id": digest, "title": title[:120], "url": url,
                      "publishedAt": iso(published), "kind": "那覇市の新着・変更候補"})
    if root.tag.lower().endswith("rss") is False and not root.findall(".//item"):
        raise ValueError("RSS structure invalid")
    items.sort(key=lambda z: z["publishedAt"], reverse=True)
    items = items[:8]
    return {"id": "naha_rss", "name": "那覇市｜公式更新", "url": NAHA_RSS_INFO, "checkedAt": iso(checked),
            "publishedAt": items[0]["publishedAt"] if items else None, "status": "ok",
            "summary": f"直近7日以内の関連する見出し {len(items)}件" if items else "直近7日の該当する公式更新は検出されませんでした。",
            "detail": "更新情報の見出しを抽出しただけ。イベント開催・運行規制・需要の確定情報ではありません。",
            "items": items}


def cruise_catalog(raw: bytes, checked: dt.datetime) -> dict:
    data = json.loads(raw)
    if data.get("success") is not True or not isinstance(data.get("result"), dict):
        raise ValueError("CKAN response invalid")
    dataset = data["result"]
    resources = [r for r in dataset.get("resources", []) if isinstance(r, dict)
                 and "2026" in (r.get("name") or "") and (r.get("format") or "").upper() == "CSV"]
    if not resources:
        raise ValueError("No 2026 cruise CSV in CKAN")
    resources.sort(key=lambda r: parse_time(r.get("last_modified") or r.get("created") or "") or dt.datetime(1970, 1, 1, tzinfo=UTC), reverse=True)
    latest = resources[0]
    modified = parse_time(latest.get("last_modified") or latest.get("created"))
    return {"id": "cruise_catalog", "name": "沖縄県｜クルーズ予約・実績資料", "url": CRUISE_PAGE,
            "checkedAt": iso(checked), "publishedAt": iso(modified), "status": "ok" if modified else "unknown",
            "summary": (latest.get("name") or "2026年の寄港予約CSV")[:160],
            "detail": "月次の予約・実績資料の所在確認のみ。今夜の実入港や乗客・タクシー需要は未確認。",
            "items": []}


SOURCES = [
    ("jma", "気象庁｜本島中南部の予報", FORECAST_URL, forecast),
    ("naha_rss", "那覇市｜公式更新", NAHA_RSS_URL, naha_news),
    ("cruise_catalog", "沖縄県｜クルーズ予約・実績資料", CRUISE_API, cruise_catalog),
]


def build(get=fetch, checked: dt.datetime | None = None) -> dict:
    checked = checked or NOW()
    sources = []
    for source_id, name, url, decoder in SOURCES:
        try:
            sources.append(decoder(get(url), checked))
        except (ValueError, TypeError, KeyError, ET.ParseError, urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            # No stale carry-over: failure must not be displayed as current data.
            reason = type(exc).__name__
            print(f"research source unavailable: {source_id} ({reason})", file=sys.stderr)
            sources.append(source_error(source_id, name, url, checked, reason))
    snapshot = {"schema": 1, "generatedAt": iso(checked), "timezone": "Asia/Tokyo",
                "method": "hourly GitHub Pages publication; individual sources can fail",
                "sources": sources, "difference": {"status": "not_checked", "added": [], "previousAt": None}}
    return snapshot


def compute_diff(current: dict, previous: dict) -> None:
    try:
        if previous.get("schema") != 1:
            return
        old_at = parse_time(previous.get("generatedAt"))
        current_at = parse_time(current.get("generatedAt"))
        if not old_at or not current_at or (current_at - old_at).total_seconds() > 3 * 86400:
            return
        previous_news = next((s for s in previous.get("sources", []) if s.get("id") == "naha_rss"), {})
        new_news = next((s for s in current.get("sources", []) if s.get("id") == "naha_rss"), {})
        if previous_news.get("status") != "ok" or new_news.get("status") != "ok":
            return
        before = {x.get("id") for x in previous_news.get("items", [])}
        added = [x for x in new_news.get("items", []) if x.get("id") not in before]
        current["difference"] = {"status": "compared", "added": added[:8], "previousAt": iso(old_at)}
    except (TypeError, ValueError, AttributeError):
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=OUTPUT)
    parser.add_argument("--no-previous", action="store_true")
    args = parser.parse_args()
    snapshot = build()
    if not args.no_previous:
        try:
            previous = json.loads(fetch(SNAPSHOT_URL, limit=600_000))
            compute_diff(snapshot, previous)
        except (ValueError, TypeError, json.JSONDecodeError, urllib.error.URLError, TimeoutError, OSError):
            print("previous public snapshot not available; difference left unconfirmed", file=sys.stderr)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("YOS TAXI research snapshot", iso(NOW()), [(s["id"], s["status"]) for s in snapshot["sources"]])


if __name__ == "__main__":
    main()
