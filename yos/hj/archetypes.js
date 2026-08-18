'use strict';

(() => {
  const items = [
    { id: 'innocent', name: '無垢な人', description: '安心や希望を守る力', light: '信じる、素直に受け取る、希望を見つける', shadow: '危険を見ない、都合の悪い事実を避ける' },
    { id: 'everyperson', name: '普通の人／孤児', description: '同じ目線でつながる力', light: '助けを求める、仲間と支え合う、現実を見る', shadow: '見捨てられる不安にのみ込まれる、自分を小さくする' },
    { id: 'hero', name: '英雄／戦士', description: '守るために動く力', light: '勇気を出す、境界を守る、やるべきことへ向かう', shadow: '戦い続ける、休めない、勝敗だけで見る' },
    { id: 'caregiver', name: '世話人', description: '人や暮らしを支える力', light: 'いたわる、育てる、必要な手助けをする', shadow: '自分を後回しにする、抱え込み過ぎる' },
    { id: 'explorer', name: '探求者', description: '自分に合う道を探す力', light: '試す、離れて見る、自由な選択肢を見つける', shadow: '落ち着けない、関係や責任から逃げ続ける' },
    { id: 'rebel', name: '反逆者／破壊者', description: '合わない形を終わらせる力', light: '不要なものを手放す、不正に異議を唱える', shadow: '壊すこと自体が目的になる、怒りで全てを切る' },
    { id: 'lover', name: '恋人', description: '大切なものと深く関わる力', light: '愛する、味わう、つながりを育てる', shadow: '失う不安に縛られる、相手と自分の境界を失う' },
    { id: 'creator', name: '創造者', description: '新しい形を生み出す力', light: '工夫する、表現する、より良い形を作る', shadow: '完成を求め過ぎる、作ることに没頭して現実を忘れる' },
    { id: 'jester', name: '道化師', description: '今を軽くし、別の見方を開く力', light: '笑う、遊ぶ、緊張をほどく', shadow: '深刻な事実をごまかす、傷つける冗談を使う' },
    { id: 'sage', name: '賢者', description: '事実と解釈を分けて考える力', light: '調べる、問い直す、思い込みを確かめる', shadow: '考えるだけで動けない、感情を理屈で押さえる' },
    { id: 'magician', name: '魔術師', description: 'つながりを見つけ、変化を起こす力', light: '経験を結び直す、小さな変化を設計する', shadow: '偶然を運命と決めつける、結果まで支配できると思う' },
    { id: 'ruler', name: '統治者', description: '秩序を作り、選択に責任を持つ力', light: '整える、決める、守る仕組みを作る', shadow: '全てを管理しようとする、他人の決定権を奪う' }
  ];
  globalThis.HJ_ARCHETYPES = Object.freeze(items.map((item) => Object.freeze(item)));
})();


