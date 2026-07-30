import assert from 'node:assert/strict';
import test from 'node:test';
import {buildNavModel} from '../dist/nav/model.js';

const header=['営業日','乗車番号','乗車時刻','降車時刻','乗車地','降車地','人数','売上','種別コード','支払方法','配車'];

test('buildNavModel excludes uncertain pickup/time rows and creates time segments',()=>{
  const rows=[
    header,
    ['2026/07/27','1','20:10',null,'久茂地','松山','1','¥1,000','G','GO','GO'],
    ['2026/07/27','2','20:28',null,'松山','若狭','1','¥800',null,'現金・その他',null],
    ['2026/07/27','3','20:45?',null,'牧志','松山','1','¥700',null,'現金・その他',null],
    ['2026/07/27','4','21:00',null,'牧志？','松山','1','¥900',null,'現金・その他',null],
    ['2026/07/27','5','22:05',null,'大山','真志喜','1','¥1,500','D','DiDi','DiDi']
  ];
  const model=buildNavModel(rows,'2026-07-30T08:00:00.000Z');
  assert.equal(model.confirmedClassifiedRides,3);
  assert.equal(model.sourcePeriod.from,'2026-07-27');
  assert.equal(model.sourcePeriod.to,'2026-07-27');
  assert.equal(model.segments.weekday['20-22']['那覇中心'].n,2);
  assert.equal(model.segments.weekday['22-24']['宜野湾'].n,1);
});

test('buildNavModel classifies weekend rides and keeps aggregate output free of raw rows',()=>{
  const rows=[
    header,
    ['2026/07/18','1','18:10',null,'美浜','松山','1','¥4,600',null,'現金・その他',null],
    ['2026/07/18','2','21:05',null,'松山','西','1','¥1,300',null,'現金・その他',null],
    ['2026/07/18','3','21:27',null,'西','牧志','1','¥1,000',null,'現金・その他',null]
  ];
  const model=buildNavModel(rows,'2026-07-30T08:00:00.000Z');
  assert.equal(model.segments.weekend['18-20']['北谷'].n,1);
  assert.equal(model.segments.weekend['20-22']['那覇中心'].n,2);
  assert.equal(JSON.stringify(model).includes('現金・その他'),false);
});

test('buildNavModel rejects sheets without usable classified rides',()=>{
  assert.throws(()=>buildNavModel([header,['2026/07/27','1','20:10?',null,'不明','不明','1','¥600']]),/No classified rides/u);
});
