const BASE='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/codex/issue-297-my-remote-widgets/ios-app/scriptable/remote-widgets/';
const files=['YOS Tapo H110 Core.js','YOS Light Widget.js','YOS Light Remote.js','YOS Light Hold Probe.js','YOS AC Probe.js','YOS AC Remote.js','YOS AC Widget.js'];
const fm=FileManager.iCloud();
for(const name of files){
  const code=await new Request(BASE+encodeURIComponent(name).replace(/%2F/g,'/')).loadString();
  fm.writeString(fm.joinPath(fm.documentsDirectory(),name),code);
}
const a=new Alert();
a.title='MY REMOTE 更新完了';
a.message='照明の確定版に加えて、SHARPエアコンの YOS AC Remote / Widget を追加しました。';
a.addAction('OK');
await a.presentAlert();
