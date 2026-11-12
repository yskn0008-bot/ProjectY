# YOS 生活学習 → DAYSTREAM 実装引き継ぎ

## 正本・担当

- 提案計算: `life/learning/*`（このPR #697、過去 #686）。
- iPhone UI・Scriptable本体・共通配布: YOS System が所管。別進行中の DAYSTREAM PR #690 と重複編集しない。
- 正本となるタスク: 既存Notion YOS Tasks。イベントは既存Life Log／生活イベントの確実な記録がある場合のみ扱う。
- Notion追加DB、Scriptable追加インストーラー、追加Webhookは不要。現在のPRは未配布・実機未検証。

## 確認済み入力契約

既存 `ios-app/scriptable/YOS Timeline Charcoal 確認 20261111.js` は、Scriptable側の `yosReadTaskSource()` により既存Notionデータソースを **Keychain内のトークン** で読み、WebViewへはトークンなしの `taskSource: { status, items, checkedAt }` を渡す。現在の `status` は `ok` / `partial` / `error` / `unavailable`。各 `items` の `id,title,due,status` のみを生活学習表示に使う。

```js
import {buildDaystreamLearningSection} from './daystream-learning-section.mjs';
const section = buildDaystreamLearningSection({
  taskSource: sanitizedExistingTaskSource,
  now: '2026-11-12T12:00:00+09:00'
});
// section.html / section.css を System 所有の既存 WebView に組み込む。
// このコードの import は Node/ES Modules 側の契約例。Scriptableの
// インラインHTMLにそのまま import して動くとは保証しない。
// section.installed は false であり、画面搭載・実機検証済みを意味しない。
```

## 画面に組み込む担当者の受入条件

1. **System側が現在のDAYSTREAM本体とPR #690の最新版を照合**。既存のデータ取得／保存／Calendar／仮完了の処理を変更しない。
2. 現行WebViewに追加する場合、`buildDaystreamLearningSection` の出力を既存ビルド／インラインJS方式に適合させる。ES Module の `import` がScriptable WebViewで直接動く前提にしない。既存 `taskSource` のコピーだけを渡す。
3. UIのマウント場所は既存タスク候補の下など「画面責任者が採用した場所」のみ。提案欄が空なら追加UIを出さない。CSSのクラスを `yos-learning-preview__*` に閉じ、他のタイムラインカードへ影響させない。
4. 時刻が未確認のNotion期限を09:00等の時刻に変換しない。期限候補は今／明日の**日付のみ**。ソースが `partial` の場合、未取得タスクが存在しないとは判断しない。アラート・バナーの勝手な送信は禁止。
5. PR #697のLife Node regression・iOS App Safety・PR evidenceを確認。マージと共通installerカタログ更新は System 担当が本体の内容とSHA-256を突き合わせた後に行う。
6. iPhone実機で、(a)期限あり、(b)完了／保留、(c)Keychain未設定、(d)Notion取得失敗、(e)既存タスクを移動／保存、(f)PR #690のついで行動と共存、を確認する。自動テスト合格だけで実機合格とみなさない。

## 現在地・戻し方

現在は表示用データ／HTMLの生成まで。System本体のWebViewへの実マウント・iPhone更新・本人操作確認・実生活からの学習は未完成。Draft PR #697 を統合しなければ既存本番へ影響なし。旧 #686 は後継移植のため未マージで閉じた。
