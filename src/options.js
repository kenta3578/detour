import { send, gateUrl, el } from './api.js';
import { normalizeEntry, originsFor } from './match.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (ms) => new Date(ms).toLocaleString('ja-JP');

const describe = (a) =>
  ({ unlock: '一時解除', remove: `削除: ${a.pattern}`, setRedirect: `リダイレクト先を変更: ${a.url}` })[a.type] ?? a.type;

async function render() {
  const st = await send({ type: 'getState' });
  const unlocked = st.unlockUntil > st.now;

  $('status').textContent = unlocked
    ? `解除中（${new Date(st.unlockUntil).toLocaleTimeString('ja-JP')} にロックへ戻ります）`
    : 'ロック中';
  $('unlock').hidden = unlocked;
  $('lock').hidden = !unlocked;

  $('patterns').replaceChildren(
    ...st.patterns.map(({ pattern, granted }) => {
      const actions = el('span', { className: 'actions' });
      if (!granted) {
        const grant = el('button', { textContent: '迂回を許可', type: 'button' });
        grant.addEventListener('click', () => requestAccess(pattern).then(render));
        actions.append(grant);
      }
      actions.append(el('a', { href: gateUrl({ type: 'remove', pattern }), textContent: '削除する' }));
      return el(
        'li',
        {},
        el('span', {}, pattern, el('span', { className: 'badge', textContent: granted ? '迂回' : 'ブロックのみ' })),
        actions,
      );
    }),
  );

  const input = $('redirect');
  if (document.activeElement !== input) input.value = st.redirectUrl;
  $('redirect-button').textContent = st.redirectUrl ? '変更（解除フローへ）' : '設定';

  $('log').replaceChildren(
    ...st.log.map((l) =>
      el('li', {}, el('time', { textContent: fmtTime(l.at) }), el('strong', { textContent: describe(l.action) }), el('div', { textContent: l.reason })),
    ),
  );
  return st;
}

// ユーザー操作の中で呼ばないと許可ダイアログが出ないので、await より前に呼ぶ
const requestAccess = (pattern) => chrome.permissions.request({ origins: originsFor(pattern) }).catch(() => false);

$('add-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('add-error').textContent = '';
  const entry = normalizeEntry($('pattern').value);
  if (!entry) {
    $('add-error').textContent = 'ドメインか URL パターンとして読めません';
    return;
  }
  const granted = requestAccess(entry.pattern);
  try {
    await send({ type: 'add', pattern: entry.pattern });
    $('pattern').value = '';
    if (!(await granted)) $('add-error').textContent = 'サイトへのアクセスが許可されなかったので、迂回ではなくブロックになります。';
    await render();
  } catch (e) {
    $('add-error').textContent = e.message;
  }
});

$('redirect-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('redirect-error').textContent = '';
  const url = $('redirect').value.trim();
  const st = await send({ type: 'getState' });
  if (st.redirectUrl) {
    location.href = gateUrl({ type: 'setRedirect', url });
    return;
  }
  try {
    await send({ type: 'setRedirect', url });
    await render();
  } catch (e) {
    $('redirect-error').textContent = e.message;
  }
});

$('unlock').addEventListener('click', () => (location.href = gateUrl({ type: 'unlock' })));
$('lock').addEventListener('click', async () => {
  await send({ type: 'lockNow' });
  await render();
});

chrome.storage.onChanged.addListener(render);
render();
