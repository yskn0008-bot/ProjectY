/**
 * DAYSTREAM learning suggestion display fragment (preview).
 * Pure string renderer: no DOM mutations, no CSS ownership, no external links.
 * The existing System-owned WebView may opt in later after review.
 */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=/^\d{4}-\d{2}-\d{2}$/;
const validDay=value=>day.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function renderDaystreamLearningPreview(snapshot,{maxCards=3}={}){
  if(!snapshot||snapshot.status!=='read_only'||!Array.isArray(snapshot.cards)||snapshot.cards.length===0)return '';
  const bounded=Math.max(0,Math.min(3,Number.isInteger(maxCards)?maxCards:3));
  if(!bounded)return '';
  const seen=new Set(),rows=[];
  for(const card of snapshot.cards){
    if(!card||card.type!=='deadline_date_only'||card.placement!=='in_app_only'||card.changesOriginal!==false||!validDay(card.dueDate))continue;
    if(typeof card.key!=='string'||!card.key||seen.has(card.key)||typeof card.title!=='string'||!card.title.trim())continue;
    seen.add(card.key);
    rows.push('<li class="yos-learning-preview__item"><span class="yos-learning-preview__title">'+esc(card.title.slice(0,120))+'</span><span class="yos-learning-preview__meta">'+esc(card.dueDate)+' · 時刻未確認</span></li>');
    if(rows.length>=bounded)break;
  }
  if(!rows.length)return '';
  const coverage=snapshot.complete===false?'一部取得したタスクのみ':'確認済みのタスクから';
  return '<section class="yos-learning-preview" aria-label="生活学習の提案" data-yos-preview="read-only">'+
    '<h2 class="yos-learning-preview__heading">生活学習からの提案 <small>確認のみ</small></h2>'+
    '<p class="yos-learning-preview__note">'+coverage+'。予定は変更しません。</p>'+
    '<ul class="yos-learning-preview__list">'+rows.join('')+'</ul></section>';
}
/** Standalone, optional styles for System to adapt to its shared theme. */
export const daystreamLearningPreviewCss=`
.yos-learning-preview{margin:12px 14px;padding:12px 14px;border:1px solid #ffffff28;border-radius:14px;background:#ffffff0c;color:inherit}
.yos-learning-preview__heading{margin:0 0 6px;font-size:14px;font-weight:650}
.yos-learning-preview__heading small{font-size:11px;font-weight:500;opacity:.7}
.yos-learning-preview__note{font-size:11px;opacity:.76;margin:0 0 8px}
.yos-learning-preview__list{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.yos-learning-preview__item{display:flex;gap:6px;justify-content:space-between;flex-wrap:wrap}
.yos-learning-preview__title{font-size:13px;min-width:0;overflow-wrap:anywhere}
.yos-learning-preview__meta{font-size:11px;opacity:.8;white-space:nowrap}
`;
