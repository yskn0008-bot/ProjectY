"""Offline regression tests for official source collector; never call remote services."""
import csv
import datetime as dt
import io
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
CRUISE_URL="https://data.bodik.jp/dataset/510b184a-6d3b-44cb-a4c5-d5eba43d0e4a/resource/4b817d77-b095-4635-9855-08343eaf45e0/download/470007_okinawa-cruise26-27_2611.csv"
CRUISE=json.dumps({"success":True,"result":{"resources":[{
 "name":"沖縄県クルーズ寄港予約・実績（2026年10月末時点）","format":"CSV",
 "url":CRUISE_URL,"metadata_modified":"2026-11-10T09:01:12.337410"
}]}}).encode()
_CSV_COLUMNS=["管理者","港湾","入港月日","入港曜日","入港時間","出港月日","出港曜日","出港時間",
 "船名","係留施設名（バース）","運航経路","前港","次港","代理店名","総トン数(GT)",
 "全長(m)","オーバーナイトの有無","旅客定員数","備考"]
def cruise_fixture(rows=None):
    if rows is None:
        rows=[
          ["那覇港管理組合","那覇港","2026-11-20","金","08:00","2026-11-20","金","20:00","MSC BELLISSIMA","第2CB"],
          ["那覇港管理組合","那覇港","2026-11-21","土","09:00","2026-11-21","土","17:00","SPECTRUM OF THE SEAS","第2CB"],
          ["那覇港管理組合","那覇港","2026-11-22","日","05:00","2026-11-22","日","10:00","TEST VESSEL","第1CB"],
          ["石垣市","石垣港","2026-11-20","金","12:00","2026-11-20","金","20:00","NOT NAHA","石垣"],
          ["那覇港管理組合","那覇港","2026-11-20","金","05:00","2026-11-20","金","07:00","SAILED ALREADY","第1CB"],
          ["那覇港管理組合","那覇港","2026-11-23","月","15:00","2026-11-23","月","20:00","BEYOND HORIZON","第1CB"],
          ["那覇港管理組合","那覇港","2026-11-21","土","未定","2026-11-21","土","20:00","UNKNOWN ARRIVAL","第1CB"]
        ]
    output=io.StringIO();writer=csv.writer(output)
    writer.writerow(_CSV_COLUMNS)
    for row in rows:writer.writerow(row+[""]*(len(_CSV_COLUMNS)-len(row)))
    return output.getvalue().encode("cp932")
CRUISE_CSV=cruise_fixture()

def getter(url):
    return {b.FORECAST_URL:FORECAST,b.NAHA_RSS_URL:RSS,b.CRUISE_API:CRUISE,CRUISE_URL:CRUISE_CSV}[url]

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
  x=b.cruise_catalog(CRUISE,CHECKED,get=getter)
  self.assertEqual(x["status"],"ok")
  self.assertIn("月次",x["detail"])
  self.assertIn("実入港・下船・タクシー需要は未確認",x["summary"])
  self.assertEqual(x["publishedAt"],"2026-11-10T09:01:12Z")
  self.assertEqual(len(x["items"]),3)
  self.assertEqual([t["eventAt"] for t in x["items"]],sorted(t["eventAt"] for t in x["items"]))
  self.assertTrue(all(t["kind"]=="公開CSVの寄港予約（実入港・乗車需要未確認）" for t in x["items"]))
  self.assertTrue(all(t["url"]==b.CRUISE_PAGE for t in x["items"]))

 def test_all_sources_isolated_on_failure(self):
  def test_getter(url):
   if url==b.NAHA_RSS_URL:raise TimeoutError("network down")
   return getter(url)
  x=b.build(get=test_getter,checked=CHECKED)
  self.assertEqual([s["status"] for s in x["sources"]],["ok","error","ok"])
  self.assertEqual(x["sources"][1]["items"],[])

 def test_difference_only_after_valid_previous_comparison(self):
  cur=b.build(get=getter,checked=CHECKED)
  prev=json.loads(json.dumps(cur));prev["sources"][1]["items"]=[]
  b.compute_diff(cur,prev)
  self.assertEqual(cur["difference"]["status"],"compared")
  self.assertEqual(len(cur["difference"]["added"]),1)
  bad={"schema":1,"generatedAt":"2025-01-01T00:00:00Z","sources":prev["sources"]}
  cur["difference"]={"status":"not_checked","added":[],"previousAt":None}
  b.compute_diff(cur,bad)
  self.assertEqual(cur["difference"]["status"],"not_checked")



 def test_cruise_is_not_a_live_arrival_and_only_na_ha_within_48h(self):
  source=b.cruise_catalog(CRUISE,CHECKED,get=getter)
  titles=" ".join(x["title"] for x in source["items"])
  self.assertIn("MSC BELLISSIMA",titles)
  self.assertIn("SPECTRUM OF THE SEAS",titles)
  self.assertNotIn("NOT NAHA",titles)
  self.assertNotIn("SAILED ALREADY",titles)
  self.assertNotIn("BEYOND HORIZON",titles)
  self.assertNotIn("UNKNOWN ARRIVAL",titles)
  self.assertTrue(all("予約" in x["title"] for x in source["items"]))

 def test_cruise_unexpected_csv_columns_fails_closed(self):
  def bad_getter(url):
   if url==CRUISE_URL:return b"other,columns\nfoo,bar\n"
   return getter(url)
  with self.assertRaisesRegex(ValueError,"columns"):
   b.cruise_catalog(CRUISE,CHECKED,get=bad_getter)

 def test_cruise_empty_naha_rows_fails_closed(self):
  only_other=cruise_fixture([["石垣市","石垣港","2026-11-21","土","09:00","2026-11-21","土","17:00","SHIP","桟橋"]])
  with self.assertRaisesRegex(ValueError,"no Naha"):
   b.cruise_catalog(CRUISE,CHECKED,get=lambda url: only_other)

 def test_cruise_old_catalog_cannot_assert_future_reservation(self):
  stale=CRUISE.replace(b"2026-11-10T09:01:12.337410",b"2026-08-10T09:01:12.337410")
  x=b.cruise_catalog(stale,CHECKED,get=getter)
  self.assertEqual(x["status"],"stale")
  self.assertEqual(x["items"],[])

 def test_cruise_csv_download_failure_isolated(self):
  def network_getter(url):
   if url==CRUISE_URL:raise TimeoutError("data source did not respond")
   return getter(url)
  result=b.build(get=network_getter,checked=CHECKED)
  self.assertEqual(result["sources"][2]["status"],"error")
  self.assertEqual(result["sources"][2]["items"],[])
  self.assertEqual(result["sources"][0]["status"],"ok")

 def test_cruise_resource_link_is_domain_restricted(self):
  spoofed=CRUISE.replace(CRUISE_URL.encode(),b"https://data.bodik.jp.evil.example/cruise.csv")
  with self.assertRaisesRegex(ValueError,"Unexpected cruise CSV URL"):
   b.cruise_catalog(spoofed,CHECKED,get=getter)

 def test_non_official_link_rejected(self):
  self.assertFalse(b.safe_url("http://www.city.naha.okinawa.jp/",domains=("www.city.naha.okinawa.jp",)))
  self.assertFalse(b.safe_url("https://evil.com.fake/www.city.naha.okinawa.jp",domains=("www.city.naha.okinawa.jp",)))

if __name__=="__main__":unittest.main()
