import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProactiveSuggestion} from './proactive-suggestion.js';

const task={order:1,title:'支払い確認',state:'本人操作',priority:'高',due:null,nextAction:'支払い状況を確認',actionUrl:'https://example.org/check'};
test('one actionable suggestion from existing widget feed',()=>{
 const result=selectProactiveSuggestion({generatedAt:null,sourceState:'active',task,tasks:[task]});
 assert.equal(result?.title,'支払い確認');
 assert.equal(result?.requiresConfirmation,true);
 assert.equal(result?.source,'existing-widget-task');
});
test('empty and unactionable feeds produce no suggestion',()=>{
 assert.equal(selectProactiveSuggestion({generatedAt:null,sourceState:'empty',task:null,tasks:[]}),null);
 assert.equal(selectProactiveSuggestion({generatedAt:null,sourceState:'next',task:{...task,nextAction:''},tasks:[]}),null);
});
test('unsafe action links are dropped, never executed',()=>{
 const result=selectProactiveSuggestion({generatedAt:null,sourceState:'active',task:{...task,actionUrl:'javascript:alert(1)'},tasks:[]});
 assert.equal(result?.actionUrl,null);
});
