// Draft UI only. Live feed is not wired until authenticated read path is verified.
(() => {
  const button = document.getElementById('proactivePreviewBtn');
  if (!button) return;
  button.addEventListener('click', () => {
    const body = document.getElementById('sheetBody');
    const backdrop = document.getElementById('sheetBackdrop');
    if (!body || !backdrop) return;
    body.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = '先回り提案';
    const message = document.createElement('p');
    message.textContent = '現在、最新データへの接続確認中です。提案はまだ表示できません。既存のFocusは変更されません。';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '閉じる';
    close.addEventListener('click', () => { backdrop.classList.remove('show'); backdrop.classList.remove('active'); backdrop.style.display = ''; });
    body.append(heading, message, close);
    backdrop.classList.add('show');
    backdrop.classList.add('active');
    backdrop.style.display = 'flex';
  });
})();
