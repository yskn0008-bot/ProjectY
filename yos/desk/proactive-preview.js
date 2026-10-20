// Preview-only entry. Uses the existing DESK sheet lifecycle; no credentials or writes.
(() => {
  const button = document.getElementById('proactivePreviewBtn');
  if (!button) return;
  button.addEventListener('click', () => {
    if (typeof showSheet !== 'function' || typeof closeSheet !== 'function') return;
    showSheet('<h3>先回り提案</h3><p>最新のYOSデータとの認証済み接続は未完了です。提案はまだ表示できません。Focusの選択は変更しません。</p><button type="button" id="closeProactivePreview">閉じる</button>');
    document.getElementById('closeProactivePreview')?.addEventListener('click', closeSheet);
  });
})();
