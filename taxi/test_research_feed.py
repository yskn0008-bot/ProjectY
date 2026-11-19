"""Offline regression tests for official source collector; never call remote services."""
import datetime as dt
import json
import unittest
import build_research_feed as b

UTC=dt.timezone.utc
CHECKED=dt.datetime(2026,11,20,2,30,tzinfo=UTC)
FORECAST=json.dumps([{"publishingOffice":"沖縄気象台","reportDatetime":"2026-11-20T10:00:00+09:00",
 "timeSeries":[{"timeDefines":["2026-11-20T09:00:00+09:00","2026-11-20T21:00:00+09:00"],
 "areas":[{"area":{"code":"471010"},"weathers":["くもり","雨"]}]}]}]).encode()
RSS=b"""<?xml version="1.0"?><rss version="2.0"><channel>
 <item><title>\xe9\x81\x93\xe8\xb7\xaf\xe4\xba\xa4\xe9\x80\x9a\xe8\xa6\x8f\xe5\x88\xb6\xe3\x81\xae\xe3\x81\x8a\xe7\x9f\xa5\xe3\x82\x89\xe3\x81\x9b</title><link>https://www.city.naha.okinawa.jp/news/test.html</link><pubDate>Fri, 20 Nov 2026 10:00:00 +0900</pubDate></item>
 <item><title>Ignore offsite traffic</title><link>https://example.net/taxi</link><pubDate>Fri, 20 Nov 2026 10:00:00 +0900</pubDate></item>
 </channel></rss>"""
CRUISE=json.dumps({"success":True,"result":{"resources":[{"name":"沖縄県クルーズ寄港予約・実績（2026年10月末時点）",
 "format":"CSV","created":"2026-11-01T10:00:00+09:00"}]}}).encode()

class CollectorTests(unittest.TestCase):
 def test_forecast_uses_active_period_and_issued_timestamp(self):
  x=b.forecast(FORECAST,CHECKED)
  self.assertEqual(x["status"],"ok")
  self.assertEqual(x["publishedAt"],"2026-11-20T01:00:00Z")
  self.assertEqual(x["summary"],"くもり")
  self.assertEqual(x["checkedAt"],b.iso(CHECKED))

 def test_stale_forecast_is_not_presented_as_current(self):
  old=FORECAST.replace(b"2026-11-20T10:00:00+09:00",b"2026-11-19T10:00:00+09:00")
  x=b.forecast(old,CHECKED)
  self.assertEqual(x["status"],"stale")
  self.assertNotEqual(x["summary"],"くもり")

 def test_rss_extracts_only_official_recent_keyword_titles(self):
  news=b.naha_news(RSS,CHECKED)
  self.assertEqual(news["status"],"ok")
  self.assertEqual(len(news["items"]),1)
  self.assertEqual(news["items"][0]["url"],"https://www.city.naha.okinawa.jp/news/test.html")

 def test_procurement_rss_is_not_a_taxi_event(self):
  feed='''<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>令和8年度那覇市LRT導入に伴う交通影響把握調査業務に係る制限付き一般競争入札の実施について</title>
  <link>https://www.city.naha.okinawa.jp/business/procurement.html</link>
  <pubDate>Fri, 20 Nov 2026 10:00:00 +0900</pubDate></item>
  <item><title>交通規制のお知らせ</title>
  <link>https://www.city.naha.okinawa.jp/news/traffic.html</link>
  <pubDate>Fri, 20 Nov 2026 10:00:00 +0900</pubDate></item>
  </channel></rss>'''.encode('utf-8')
  items=b.naha_news(feed,CHECKED)["items"]
  self.assertEqual(len(items),1)
  self.assertEqual(items[0]["title"],"交通規制のお知らせ")

 def test_cruise_is_catalog_not_arrival(self):
  x=b.cruise_catalog(CRUISE,CHECKED)
  self.assertEqual(x["status"],"ok")
  self.assertIn("月次",x["detail"])
  self.assertNotIn("実入港確認",x["summary"])

 def test_all_sources_isolated_on_failure(self):
  def getter(url):
   if url==b.FORECAST_URL:return FORECAST
   if url==b.NAHA_RSS_URL:raise TimeoutError("network down")
   return CRUISE
  x=b.build(get=getter,checked=CHECKED)
  self.assertEqual([s["status"] for s in x["sources"]],["ok","error","ok"])
  self.assertEqual(x["sources"][1]["items"],[])

 def test_difference_only_after_valid_previous_comparison(self):
  def getter(url):
   return {b.FORECAST_URL:FORECAST,b.NAHA_RSS_URL:RSS,b.CRUISE_API:CRUISE}[url]
  cur=b.build(get=getter,checked=CHECKED)
  prev=json.loads(json.dumps(cur));prev["sources"][1]["items"]=[]
  b.compute_diff(cur,prev)
  self.assertEqual(cur["difference"]["status"],"compared")
  self.assertEqual(len(cur["difference"]["added"]),1)
  bad={"schema":1,"generatedAt":"2025-01-01T00:00:00Z","sources":prev["sources"]}
  cur["difference"]={"status":"not_checked","added":[],"previousAt":None}
  b.compute_diff(cur,bad)
  self.assertEqual(cur["difference"]["status"],"not_checked")

 def test_non_official_link_rejected(self):
  self.assertFalse(b.safe_url("http://www.city.naha.okinawa.jp/",domains=("www.city.naha.okinawa.jp",)))
  self.assertFalse(b.safe_url("https://evil.com.fake/www.city.naha.okinawa.jp",domains=("www.city.naha.okinawa.jp",)))

if __name__=="__main__":unittest.main()
