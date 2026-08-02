'use strict';
(() => {
  const card = document.querySelector('.domain-card.journey');
  if (!card) return;
  card.setAttribute('href', './hj/');
  const title = card.querySelector('b');
  const copy = card.querySelector('small');
  if (title) title.textContent = "Hero's Journey";
  if (copy) copy.textContent = '複数の旅・螺旋成長・今週の物語';
})();
