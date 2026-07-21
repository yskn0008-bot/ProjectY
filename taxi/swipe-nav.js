'use strict';
(()=>{
  // Legacy 3-page swipe navigation is retired.
  // The current Taxi UI handles 5-page navigation and swipe order in ui-v24.js.
  document.querySelectorAll('nav[aria-label="画面切り替え"]').forEach(node=>node.remove());
  const previewCard=document.getElementById('yosSwipePreviewCard');
  if(previewCard?.parentElement)previewCard.parentElement.remove();
  document.body.style.transform='';
  document.body.style.transition='';
  document.body.style.opacity='';
})();
