import assert from 'node:assert/strict';
import test from 'node:test';
import {buildImadaNavModel} from '../dist/nav/imada-model.js';

const header=['営業日','乗車番号','乗車時刻','降車時刻','乗車地','降車地','人数','売上','種別コード','支払方法','配車'];

test('buildImadaNavModel prioritizes measured idle time when three actual samples exist',()=>{
  const rows=[
    header,
    ['2026/07/27','1','20:00','20:10','松山','久茂地','1','1000',null,'現金',null],
    ['2026/07/27','2','20:18','20:28','久茂地','久茂地','1','1200','G','GO','GO'],
    ['2026/07/27','3','20:40','20:50','久茂地','久茂地','1','900',null,'現金',null],
    ['2026/07/27','4','21:05','21:15','久茂地','松山','1','1500',null,'現金',null],
    ['2026/07/27','5','21:30','21:40','松山','若狭','1','1100',null,'現金',null]
  ];
  const model=buildImadaNavModel(rows,'2026-07-31T00:00:00.000Z');
  const metric=model.segments.weekday['20-22']['那覇中心'];
  assert.equal(model.version,'3.0-imada-v47');
  assert.deepEqual(model.decisionPriority,['predictedIdleMinutes','tripsPerHour','expectedHourlyRevenue']);
  assert.equal(model.formula.idle,50);
  assert.equal(metric.idleBasis,'actual');
  assert.equal(metric.actualIdleSamples,4);
  assert.equal(metric.predictedIdleMinutes,13.5);
  assert.ok(metric.tripsPerHour>2);
  assert.ok(metric.expectedHourlyRevenue>2000);
});

test('buildImadaNavModel labels pickup intervals as proxy when dropoff times are unavailable',()=>{
  const rows=[
    header,
    ['2026/07/28','1','20:00',null,'松山','久茂地','1','1000',null,'現金',null],
    ['2026/07/28','2','20:20',null,'久茂地','松山','1','1200','G','GO','GO'],
    ['2026/07/28','3','20:45',null,'松山','若狭','1','900',null,'現金',null]
  ];
  const model=buildImadaNavModel(rows,'2026-07-31T00:00:00.000Z');
  const metric=model.segments.weekday['20-22']['那覇中心'];
  assert.equal(metric.predictedIdleMinutes,null);
  assert.equal(metric.idleBasis,'pickup-interval');
  assert.equal(metric.predictedCycleMinutes,22.5);
  assert.ok(metric.efficiencyConfidence<100);
});

test('buildImadaNavModel exposes the 15-minute move rule without raw payment data',()=>{
  const rows=[
    header,
    ['2026/07/29','1','22:00','22:10','大山','真志喜','1','1500','D','DiDi','DiDi'],
    ['2026/07/29','2','22:20','22:30','真志喜','大山','1','1700','G','GO','GO']
  ];
  const model=buildImadaNavModel(rows,'2026-07-31T00:00:00.000Z');
  assert.equal(model.operationalRules.noResponseMinutes,15);
  assert.equal(model.operationalRules.consecutiveLowFareLimit,2);
  assert.equal(model.operationalRules.halfHourSalesThreshold,2000);
  assert.equal(JSON.stringify(model).includes('DiDi'),false);
  assert.equal(JSON.stringify(model).includes('現金'),false);
});
