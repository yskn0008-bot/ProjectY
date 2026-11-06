from pathlib import Path
import json,hashlib,base64,re
p=Path(__file__).resolve().parent
asset_commit='bd67b996c0da7e54e99b7a3528c2a3233e329c6b'
refs=json.loads((p/'reference-wallpaper-manifest.json').read_text())
for k,v in refs.items():
 b=(p/v['file']).read_bytes()
 assert hashlib.sha256(b).hexdigest()==v['sha256']
 v['url']='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/'+asset_commit+'/life/calendar/'+v['file']
 v['base64SHA256']=hashlib.sha256(base64.b64encode(b)).hexdigest()
core=(p/'reference-wallpaper-core.js').read_text()
installer=(p/'YOS_DAYSTREAM_Timeline_Installer.js').read_text()
sha_fn=installer[installer.index('function sha256Hex(input){'):installer.index('// Open the already integrity-checked package')].strip()
code='// YOS LIFE FLOW — exact supplied image, static design foundation only.\n'+core+'\n'+sha_fn+'\nconst REFERENCE_IMAGES='+json.dumps(refs,ensure_ascii=False)+';\n'+'''try{
 const kind=(typeof args!=='undefined'&&(args.shortcutParameter==='compact'||args.queryParameters?.reference==='compact'))?'compact':'glass';
 const ref=REFERENCE_IMAGES[kind],request=new Request(ref.url);request.timeoutInterval=30;
 const data=await request.load();
 if(request.response?.statusCode!==200)throw Error('原本画像を取得できませんでした');
 const encoded=data.toBase64String();
 if(sha256Hex(encoded)!==ref.base64SHA256)throw Error('原本画像の内容を確認できませんでした');
 const web=new WebView();await web.loadHTML(YOSReferenceWallpaper.html(ref,'data:image/jpeg;base64,'+encoded));await web.present(true);
}catch(e){const alert=new Alert();alert.title='LIFE FLOW 画像の表示';alert.message=String(e.message||e);alert.addAction('閉じる');await alert.presentAlert();}finally{Script.complete();}
'''
(p/'YOS_DAYSTREAM_Reference_Wallpaper.js').write_text(code)
print('Built static renderer; original JPEGs unchanged; no script/plan writes')
