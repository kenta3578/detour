import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGate, beat, remaining, checkComplete } from '../src/gate-logic.js';

const cfg = { waitMs: 30 * 60e3, gapMs: 5e3, reasonMin: 100 };
const reason = 'あ'.repeat(100);

// 1 秒ごとに心拍を送り続けた状態を作る
function beatUntil(gate, from, to) {
  for (let t = from + 1000; t <= to; t += 1000) gate = beat(gate, t, cfg);
  return gate;
}

test('待ち時間を心拍を途切れさせずに過ごし、理由が足りれば完了できる', () => {
  const g = beatUntil(startGate({ type: 'unlock' }, 0), 0, cfg.waitMs);
  assert.equal(remaining(g, cfg.waitMs, cfg), 0);
  assert.equal(checkComplete(g, cfg.waitMs, reason, cfg), null);
});

test('待ち時間が残っていれば完了できない', () => {
  const g = beatUntil(startGate({ type: 'unlock' }, 0), 0, 10 * 60e3);
  assert.equal(checkComplete(g, 10 * 60e3, reason, cfg), 'waiting');
});

test('心拍が途切れたら待ち時間は最初からやり直す', () => {
  let g = beatUntil(startGate({ type: 'unlock' }, 0), 0, 20 * 60e3);
  g = beat(g, 20 * 60e3 + 10e3, cfg); // 10 秒離れた
  assert.equal(g.startedAt, 20 * 60e3 + 10e3);
  assert.equal(remaining(g, g.startedAt, cfg), cfg.waitMs);
});

test('心拍なしで時間だけ経っても完了できない', () => {
  const g = startGate({ type: 'unlock' }, 0);
  assert.equal(checkComplete(g, cfg.waitMs, reason, cfg), 'interrupted');
});

test('理由は前後の空白を除いて数える', () => {
  const g = beatUntil(startGate({ type: 'unlock' }, 0), 0, cfg.waitMs);
  assert.equal(checkComplete(g, cfg.waitMs, '  ' + 'あ'.repeat(99) + '   ', cfg), 'reason-short');
  assert.equal(checkComplete(null, 0, reason, cfg), 'no-gate');
});
