// 解除フローの判定。時刻を引数で受けるので、30 分待たずにテストできる。

export const startGate = (action, now) => ({ action, startedAt: now, lastBeat: now });

/** 心拍が途切れていたら待ち時間を最初からやり直す */
export function beat(gate, now, { gapMs }) {
  if (now - gate.lastBeat > gapMs) return { ...gate, startedAt: now, lastBeat: now };
  return { ...gate, lastBeat: now };
}

export const remaining = (gate, now, { waitMs }) => Math.max(0, waitMs - (now - gate.startedAt));

export const reasonLength = (reason) => [...String(reason ?? '').trim()].length;

/** 完了できなければ理由のコードを返す */
export function checkComplete(gate, now, reason, cfg) {
  if (!gate) return 'no-gate';
  if (now - gate.lastBeat > cfg.gapMs) return 'interrupted';
  if (remaining(gate, now, cfg) > 0) return 'waiting';
  if (reasonLength(reason) < cfg.reasonMin) return 'reason-short';
  return null;
}
