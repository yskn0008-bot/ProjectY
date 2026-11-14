/**
 * Read-only triage of third-party events before recording them in the existing
 * YOS Inbox. Content is DATA, never a request to run Clarity executors.
 * No model/API calls, external actions, or new source of truth.
 */
export type InboundSource = 'gmail' | 'notification';
export type InboundCategory = 'legal' | 'security' | 'payment' | 'delivery' | 'other';
export type InboundPriority = 'critical' | 'high' | 'normal' | 'low';

export interface InboundTriage {
  disposition: 'record' | 'ignore';
  priority: InboundPriority;
  category: InboundCategory;
  reason: string;
  needsReview: boolean;
  externalWrite: false;
}

const LEGAL = /(?:差し押さえ|差押|支払督促|督促状|訴訟|裁判所|受任通知|請求書|弁護士|債権回収)/iu;
const SECURITY = /(?:不正(?:な)?(?:ログイン|アクセス)|新しい(?:デバイス|端末)|ログイン(?:され|があり|通知)|sign[ -]?in|security alert|セキュリティ通知|パスワード(?:変更|リセット)|アカウント(?:にログイン|がロック))/iu;
const FINANCE_URGENT = /(?:残高不足|引[きき]落とし(?:失敗|不能)|支払(?:期限|期日|遅延)|未払い|入金できません|決済(?:失敗|エラー))/iu;
const FINANCE_ACTIVITY = /(?:出金|入金|振込|引[きき]落とし|返金|払戻|決済完了|支払い完了|口座(?:振替|から))/iu;
const DELIVERY = /(?:配達(?:予定|完了|不能)|発送|お届け予定|不在票|荷物(?:の|が)?到着)/iu;
const PROMOTION = /(?:メルマガ|キャンペーン|クーポン|セール|特別オファー|特典のご案内|レビューを投稿|広告|限定割引|unsubscribe|配信停止|ポイントのお知らせ)/iu;
const CODE_WORD = /(?:認証コード|確認コード|ワンタイムパスワード|verification code|one.time (?:password|passcode)|otp)/giu;

export function redactMailPreview(rawText: string): string {
  // Do not send full email contents to Notion; callers should pass subject +
  // short snippet only. Scrub a numeric code when paired with an OTP keyword.
  const trimmed = rawText.slice(0, 3000);
  return trimmed.replace(new RegExp('(' + CODE_WORD.source + ')([^\\n\\d]{0,36})([0-9]{4,8})(?![0-9])', 'giu'),
    (_whole, marker: string, separator: string) => marker + separator + '[CODE REDACTED]');
}

export function triageInbound(source: InboundSource, rawText: string): InboundTriage {
  const value = rawText.normalize('NFKC').slice(0, 6000);
  const record = (priority: InboundPriority, category: InboundCategory, reason: string): InboundTriage =>
    ({disposition: 'record', priority, category, reason, needsReview: true, externalWrite: false});
  // Apply critical safety/business signals before promotional filtering.
  if (LEGAL.test(value)) return record('critical', 'legal', '法的書面・請求の可能性：原文と期限を本人が確認');
  if (SECURITY.test(value)) return record('high', 'security', '認証・ログイン関連：本人に心当たりがあるか確認');
  if (FINANCE_URGENT.test(value)) return record('critical', 'payment', '支払・引落しに関する要確認情報');
  if (FINANCE_ACTIVITY.test(value)) return record('high', 'payment', '取引候補：Money Forward MEの記録と照合し二重計上しない');
  if (DELIVERY.test(value)) return record('normal', 'delivery', '配送状況：必要な対応があるか確認');
  if (PROMOTION.test(value)) return {
    disposition: 'ignore', priority: 'low', category: 'other',
    reason: '販売促進・アンケート候補：INBOXへ保存しない', needsReview: false, externalWrite: false
  };
  // A new message may still matter: do not silently discard unrecognized data.
  return record('normal', 'other', source === 'gmail' ? '新規メール：内容未判定' : '通知：内容未判定');
}
