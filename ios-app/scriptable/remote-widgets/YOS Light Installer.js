const BASE='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/codex/issue-297-my-remote-widgets/ios-app/scriptable/remote-widgets/';
const files=['YOS Tapo H110 Core.js','YOS Light Widget.js','YOS Light Remote.js','YOS Light Hold Probe.js'];
const fm=FileManager.iCloud();
for(const name of files){
  const code=await new Request(BASE+encodeURIComponent(name).replace(/%2F/g,'/')).loadString();
  fm.writeString(fm.joinPath(fm.documentsDirectory(),name),code);
}
const a=new Alert();
a.title='照明リモコン更新完了';
a.message='明るい／暗いの長押しを、まとめ連射ではなく1回ずつ送る方式へ変更しました。離した後に送信済みの連射が残らない構成です。';
a.addAction('OK');
await a.presentAlert();
