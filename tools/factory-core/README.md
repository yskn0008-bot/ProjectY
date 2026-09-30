# One Enter Factory Core v1

目的は **GitHub / Vercel が止まっても開発そのものを止めないこと**。

## 正本

開発の正本は `local_store`。GitHub は正本ではなく任意の mirror、Vercel は任意の host として扱う。

`main` に相当する概念は `state/current.json` の **current snapshot**。各 snapshot は全ファイルの SHA-256 manifest を持つため、履歴、差分、検証、rollback を GitHub なしで実行できる。

## 自前化した機能

- ソース保管: snapshot ZIP
- 変更履歴: immutable history + manifest
- 正式版: current snapshot pointer
- 差分: manifest diff
- 破損検査: per-file SHA-256 verification
- Rollback: verified snapshot restore
- Artifact保管: local store / export
- Provider切替: provider health + deterministic fallback
- GitHub: optional mirror
- Vercel: optional host

公開URLだけはネット上のhostが必要なので、外部サービスを完全には消さない。重要なのは **host障害を開発停止理由にしない** こと。iPhone向けには `iphone_bundle` を独立した配布fallbackとして扱う。

## Store

```bash
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory init
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory snapshot /path/to/ProjectY --label current
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory verify
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory list
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory diff OLD_ID NEW_ID
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory restore /path/to/restore-target SNAPSHOT_ID
```

Secrets (`.env`, signing keys, certificates, provisioning profiles) and build caches are excluded from snapshots by default.

## Provider fallback

```bash
python3 tools/factory-core/provider_router.py select source_store
python3 tools/factory-core/provider_router.py select qa_runner
python3 tools/factory-core/provider_router.py fail public_host github_pages "rate limit"
```

A provider failure returns the next eligible route instead of `stop` when another route exists.

## YOS Loop Engine

`yos_loop_engine.py` adds a bounded implementation loop inside the existing One Enter / Factory Core path.

```text
Build
→ Verify
→ FAILなら evidence を渡して Recover
→ Verify
→ 最大2回で停止
→ Code verified / Owner boundary / Blocked
```

- 同じ失敗への自動回復は最大2回
- scope外 / forbidden path変更は即停止
- physical iPhone / Production確認を自動PASS扱いしない
- 結果は機械可読JSONで返す
- merge / 本番公開 / 課金 / 外部送信は自動化しない

詳細: `docs/YOS_LOOP_ENGINE_v1.md`

実行例:

```bash
python3 tools/factory-core/yos_loop_engine.py \
  --job /path/to/job.json \
  --repo /path/to/ProjectY \
  --result /tmp/yos-loop-result.json
```

## Test

```bash
python3 -m unittest discover -s tools/factory-core/tests -v
```

## Boundary

Apple signing / App Store distribution, public DNS/hosting, credentials/2FA and physical iPhone verification still require their real external boundary. They are adapters around Factory Core, not the Factory Core itself.

## iPhone local fallback

`YOS_Local_Fallback.js` is a self-contained Scriptable entry that does not fetch GitHub Pages or Vercel. On first run it creates local state files under `iCloud Drive/Scriptable/One Enter Factory/state/` and renders the YOS asset dashboard from those files. This is a fallback route, not a claim that the signed native YOS app has been installed.
