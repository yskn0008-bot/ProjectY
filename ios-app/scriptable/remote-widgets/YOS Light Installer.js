const BASE='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/codex/issue-297-my-remote-widgets/ios-app/scriptable/remote-widgets/';
const files=['YOS Tapo H110 Core.js','YOS Light Widget.js','YOS Light Remote.js','YOS Light Hold Probe.js'];
const fm=FileManager.iCloud();
for(const name of files){
  const code=await new Request(BASE+encodeURIComponent(name).replace(/%2F/g,'/')).loadString();
  fm.writeString(fm.joinPath(fm.documentsDirectory(),name),code);
}
const a=new Alert();
a.title='照明リモコン更新完了';
a.message='連続送信で止まらなくなる問題を避けるため、明るい／暗いは一時的に1タップ1回へ戻しました。YOS Light Hold Probe を実行すると、物理リモコン同等の長押し実装に必要なIRデータを安全に取得できます。';
a.addAction('OK');
await a.presentAlert();
