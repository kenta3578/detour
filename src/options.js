import { send, gateUrl, el } from './api.js';

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
    ...st.patterns.map((p) =>
      el('li', {}, el('span', { textContent: p }), el('a', { href: gateUrl({ type: 'remove', pattern: p }), textContent: '削除する' })),
    ),
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

$('add-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('add-error').textContent = '';
  try {
    await send({ type: 'add', pattern: $('pattern').value });
    $('pattern').value = '';
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
