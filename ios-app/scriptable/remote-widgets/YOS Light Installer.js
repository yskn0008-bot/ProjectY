const BASE='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/codex/issue-297-my-remote-widgets/ios-app/scriptable/remote-widgets/';
const files=['YOS Tapo H110 Core.js','YOS Light Widget.js','YOS Light Remote.js'];
const fm=FileManager.iCloud();
for(const name of files){
  const code=await new Request(BASE+encodeURIComponent(name).replace(/%2F/g,'/')).loadString();
  fm.writeString(fm.joinPath(fm.documentsDirectory(),name),code);
}
const a=new Alert();
a.title='照明リモコン更新完了';
a.message='ウィジェットは1タップで小さく調光。YOS Light Remote では「明るい／暗い」を押している間だけ連続調光します。';
a.addAction('OK');
await a.presentAlert();
