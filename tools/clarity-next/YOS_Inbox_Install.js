// YOS_INBOX_INSTALL_20261101 — paste once into a new Scriptable script, then run.
// It installs a pinned, reviewed local copy. The next run performs only the approved test.
const url='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/efc21a6e85ebf99b792da7f6505836835327741d/tools/clarity-next/YOS_Inbox_Classifier.js';
try{
 const r=new Request(url);r.timeoutInterval=20;const code=await r.loadString();
 let h=2166136261;for(let i=0;i<code.length;i++){h^=code.charCodeAt(i);h=Math.imul(h,16777619);}
 if(code.length!==8382||(h>>>0).toString(16)!=='c8af7119'||!code.includes("TEST_CAPTURE_ID='clarity:yos-test-20261101-0649'"))throw Error('配布版が一致しません。何も変更していません');
 const ic=FileManager.iCloud(),lc=FileManager.local(),path=module.filename;
 const fm=path.startsWith(ic.documentsDirectory()+'/')?ic:path.startsWith(lc.documentsDirectory()+'/')?lc:null;
 if(!fm)throw Error('Scriptableの保存場所を確認できません');
 const before=fm.readString(path);
 if(!before.includes('c8af7119')||!before.includes('raw.githubusercontent.com/yskn0008-bot/ProjectY/efc21a6e85ebf99b792da7f6505836835327741d'))throw Error('更新対象を確認できません');
 fm.writeString(path,code);
 if(fm.readString(path)!==code){fm.writeString(path,before);throw Error('保存の照合に失敗しました。元に戻しました');}
 const a=new Alert();a.title='YOS Inbox｜準備完了';a.message='次回実行は既存の承認済みテスト1件だけを照合します。';a.addAction('閉じる');await a.present();
}catch(e){const a=new Alert();a.title='導入できませんでした';a.message=String(e.message||e);a.addAction('閉じる');await a.present();}
Script.complete();
