import { REASON_MIN, WAIT_MS } from './config.js';
import { reasonLength } from './gate-logic.js';
import { send } from './api.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

let action;
try {
  action = JSON.parse(decodeURIComponent(location.hash.slice(1)));
} catch {
  action = null;
}

const TITLES = {
  unlock: '一時解除する',
  remove: `「${action?.pattern}」を削除する`,
  setRedirect: `リダイレクト先を「${action?.url}」に変える`,
};
$('title').textContent = TITLES[action?.type] ?? '解除フロー';

let remainingMs = WAIT_MS;
let timer;

function update() {
  const sec = Math.ceil(remainingMs / 1000);
  $('timer').textContent = `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
  const len = reasonLength($('reason').value);
  $('count').textContent = `${len} / ${REASON_MIN} 文字`;
  $('complete').disabled = remainingMs > 0 || len < REASON_MIN;
}

async function tick() {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) {
    $('notice').textContent = '画面から離れています。このまま戻ると待ち時間はやり直しです。';
    return;
  }
  try {
    const r = await send({ type: 'gateBeat' });
    $('notice').textContent = r.reset ? '画面から離れたので、待ち時間をやり直しました。' : '';
    remainingMs = r.remainingMs;
    update();
  } catch (e) {
    $('notice').textContent = e.message;
  }
}

async function start() {
  try {
    const r = await send({ type: 'gateStart', action });
    remainingMs = r.remainingMs;
    update();
    timer = setInterval(tick, 1000);
  } catch (e) {
    $('notice').textContent = e.message;
    $('reason').disabled = true;
  }
}

$('reason').addEventListener('input', update);
$('reason').addEventListener('paste', (ev) => ev.preventDefault()); // 定型文の貼り付けで済ませない

$('complete').addEventListener('click', async () => {
  try {
    await send({ type: 'gateComplete', reason: $('reason').value });
    clearInterval(timer);
    $('notice').textContent = '実行しました。';
    setTimeout(() => (location.href = 'options.html'), 1500);
  } catch (e) {
    $('notice').textContent = e.message;
  }
});

$('cancel').addEventListener('click', () => send({ type: 'gateCancel' }));

update();
start();
