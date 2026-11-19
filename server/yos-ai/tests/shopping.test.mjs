import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {parseShoppingItem} from '../dist/shopping/handler.js';

const page=(properties={},overrides={})=>({
  id:'33e8d09b-97d5-4f39-9e00-fbcdc8a30475',
  archived:false,
  last_edited_time:'2026-11-19T04:01:00.000Z',
  cover:{type:'external',external:{url:'https://example.com/item-photo.jpg'}},
  properties:{
    商品名:{title:[{plain_text:'洗顔フォーム 120g'}]},
    分類:{select:{name:'美容'}},
    区分:{select:{name:'日用品'}},
    現在価格:{number:980},
    参考価格:{number:1200},
    目標価格:{number:1000},
    価格更新日:{date:{start:'2026-11-19'}},
    価格情報元:{select:{name:'手動'}},
    販売店:{multi_select:[{name:'楽天'}]},
    商品URL:{url:'https://example.com/p/123'},
    在庫数:{number:1},補充基準:{number:1},
    買い物状態:{select:{name:'購入候補'}},
    購入済:{checkbox:false},
    ...properties
  },
  ...overrides
});

test('shopping Notion parser preserves real product fields and cover photo',()=>{
  const item=parseShoppingItem(page());
  assert.equal(item.name,'洗顔フォーム 120g');
  assert.equal(item.currentPrice,980);
  assert.equal(item.referencePrice,1200);
  assert.equal(item.targetPrice,1000);
  assert.equal(item.imageUrl,'https://example.com/item-photo.jpg');
  assert.deepEqual(item.shop,['楽天']);
  assert.equal(item.purchased,false);
  assert.equal(item.stock,1);
  assert.equal(item.reorderAt,1);
  assert.equal(item.id,'33e8d09b97d54f399e00fbcdc8a30475');
});

test('shopping source never fabricates absent prices or photos',()=>{
  const item=parseShoppingItem(page({
    現在価格:{number:null},参考価格:{number:null},価格更新日:{date:null}
  },{cover:null}));
  assert.equal(item.currentPrice,null);
  assert.equal(item.referencePrice,null);
  assert.equal(item.priceUpdatedAt,null);
  assert.equal(item.imageUrl,null);
});

test('shopping source rejects unsafe URLs and missing product titles',()=>{
  assert.equal(parseShoppingItem(page({商品名:{title:[]}})),null);
  assert.equal(parseShoppingItem(page({}, {archived:true})),null);
  const unsafe=parseShoppingItem(page({商品URL:{url:'javascript:alert(1)'}},{cover:{external:{url:'data:image/png;base64,xxx'}}}));
  assert.equal(unsafe.url,null);
  assert.equal(unsafe.imageUrl,null);
});

test('shopping frontend includes requested high-density photo-card interactions',async()=>{
  const root=new URL('../../../yos/shopping/',import.meta.url);
  const html=await readFile(new URL('index.html',root),'utf8');
  const css=await readFile(new URL('shopping.css',root),'utf8');
  const js=await readFile(new URL('shopping.js',root),'utf8');
  assert.match(html,/id="productGrid"/);
  assert.match(html,/data-filter="sale"/);
  assert.match(html,/id="addToggle"/);
  assert.match(html,/data-bottom="favorites"/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.flag/);
  assert.match(js,/値引き中/);
  assert.match(js,/expectedEditedAt/);
  assert.match(js,/shopping-favorites-v1/);
  assert.doesNotThrow(()=>new Function(js),'frontend JavaScript syntax');
});
