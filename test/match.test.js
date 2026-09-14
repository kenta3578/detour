import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntry, buildRules, matchesUrl, validateRedirect, originsFor } from '../src/match.js';

test('normalizeEntry: ドメインとパスを読み分ける', () => {
  assert.deepEqual(normalizeEntry('https://www.YouTube.com/'), { kind: 'domain', host: 'youtube.com', pattern: 'youtube.com' });
  assert.deepEqual(normalizeEntry('*.x.com'), { kind: 'domain', host: 'x.com', pattern: 'x.com' });
  assert.deepEqual(normalizeEntry('youtube.com/shorts/*'), {
    kind: 'path',
    host: 'youtube.com',
    path: '/shorts/*',
    pattern: 'youtube.com/shorts/*',
  });
  assert.equal(normalizeEntry('youtube'), null);
  assert.equal(normalizeEntry(''), null);
  assert.equal(normalizeEntry('a.com/x^y'), null);
});

test('matchesUrl: ドメインはサブドメインも含み、似た名前は含まない', () => {
  assert.ok(matchesUrl('youtube.com', 'https://m.youtube.com/watch?v=1'));
  assert.ok(matchesUrl('youtube.com', 'http://youtube.com'));
  assert.ok(!matchesUrl('youtube.com', 'https://notyoutube.com/'));
  assert.ok(!matchesUrl('youtube.com', 'chrome://youtube.com/'));
});

test('matchesUrl: パスは前方一致で * を任意文字列として扱う', () => {
  assert.ok(matchesUrl('youtube.com/shorts/*', 'https://www.youtube.com/shorts/abc'));
  assert.ok(!matchesUrl('youtube.com/shorts/*', 'https://www.youtube.com/watch?v=1'));
  assert.ok(matchesUrl('youtube.com/results?search_query=*', 'https://youtube.com/results?search_query=cat'));
  assert.ok(matchesUrl('a.com/x.y', 'https://a.com/x.y/z'));
  assert.ok(!matchesUrl('a.com/x.y', 'https://a.com/xzy'));
});

test('buildRules: 1 パターンにつき main_frame と sub_frame のルールを作る', () => {
  const rules = buildRules(['youtube.com', 'x.com/home'], { url: 'https://example.org/' }, new Set(['youtube.com']));
  assert.deepEqual(rules.map((r) => r.id), [1, 2, 3, 4]);
  assert.deepEqual(rules[0].condition, { requestDomains: ['youtube.com'], resourceTypes: ['main_frame'] });
  assert.equal(rules[0].action.type, 'redirect');
  assert.deepEqual(rules[3].condition, { urlFilter: '||x.com/home', resourceTypes: ['sub_frame'] });
  assert.equal(rules[3].action.type, 'block');
});

test('buildRules: アクセス許可のないパターンは素通しにせずブロックする', () => {
  const rules = buildRules(['x.com/home'], { url: 'https://example.org/' });
  assert.equal(rules[0].action.type, 'block');
});

test('originsFor: ホストとサブドメインの許可を求める', () => {
  assert.deepEqual(originsFor('https://www.youtube.com/shorts/*'), ['*://youtube.com/*', '*://*.youtube.com/*']);
  assert.deepEqual(originsFor('bad'), []);
});

test('validateRedirect: 登録パターンに一致する URL はループするので拒否する', () => {
  assert.equal(validateRedirect('https://example.org/', ['youtube.com']), null);
  assert.ok(validateRedirect('https://www.youtube.com/', ['youtube.com']));
  assert.ok(validateRedirect('javascript:alert(1)', []));
  assert.ok(validateRedirect('not a url', []));
});
