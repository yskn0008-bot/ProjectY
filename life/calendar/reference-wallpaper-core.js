/* Literal reference-image viewport. No recreated typography, cards or effects. */
(function(root){
 'use strict';
 function geometry(ref,width){
  const c=ref.crop;
  if(!Number.isFinite(width)||width<=0||!c||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>ref.sourceWidth||c.y+c.height>ref.sourceHeight)throw Error('Invalid reference viewport');
  const scale=width/c.width;
  return {width,height:c.height*scale,imageWidth:ref.sourceWidth*scale,imageHeight:ref.sourceHeight*scale,left:-c.x*scale,top:-c.y*scale,scale};
 }
 function html(ref,dataURL){
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataURL))throw Error('Invalid image data');
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>YOS LIFE FLOW｜静止画の土台</title><style>*{box-sizing:border-box}html,body{margin:0;background:#f5f6fb}#reference{position:relative;width:100%;overflow:hidden}#source{position:absolute;max-width:none;pointer-events:none;user-select:none;-webkit-user-select:none}body{overflow-x:hidden}</style></head><body><main id="reference" aria-label="指定画像そのままの静止画。時刻・予定・効果表示は画像内の見本です。"><img id="source" draggable="false" alt="YOS LIFE FLOWの指定デザイン原本。今回は静止画の土台です。" src="'+dataURL+'"></main><script>const ref='+JSON.stringify(ref)+';const geometry='+geometry.toString()+';const frame=document.getElementById("reference"),image=document.getElementById("source");function layout(){const g=geometry(ref,document.documentElement.clientWidth);frame.style.height=g.height+"px";image.style.width=g.imageWidth+"px";image.style.height=g.imageHeight+"px";image.style.left=g.left+"px";image.style.top=g.top+"px"}layout();addEventListener("resize",layout);</script></body></html>';
 }
 const api={geometry,html};root.YOSReferenceWallpaper=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
