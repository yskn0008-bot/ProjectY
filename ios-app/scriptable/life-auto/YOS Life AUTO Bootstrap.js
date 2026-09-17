// YOS Life AUTO Bootstrap v0.2
// One-paste bootstrap: installs the pinned Life AUTO Installer, then opens it.

const INSTALLER_SHA = 'bb4c089e6e3ea701e4bea66bc9e6117057031ec2'
const URL = `https://raw.githubusercontent.com/yskn0008-bot/ProjectY/${INSTALLER_SHA}/ios-app/scriptable/life-auto/YOS%20Life%20AUTO%20Installer.js`
const NAME = 'YOS Life AUTO Installer.js'
const MARKERS = ['YOS Life AUTO Installer v0.2', 'backup + rollback', 'YOS Life AUTO Router.js', 'FORBIDDEN_MARKERS']

const req = new Request(URL)
req.timeoutInterval = 20
const source = await req.loadString()
if (!source || source.length < 1000 || !MARKERS.every(marker => source.includes(marker))) {
  throw new Error('Life AUTO Installerの取得内容を確認できませんでした')
}

const fm = FileManager.iCloud()
const target = fm.joinPath(fm.documentsDirectory(), NAME)
fm.writeString(target, source)
if (fm.readString(target) !== source) throw new Error('Installer保存確認に失敗しました')

Safari.open('scriptable:///run?scriptName=' + encodeURIComponent(NAME.replace(/\.js$/i, '')))
Script.complete()
