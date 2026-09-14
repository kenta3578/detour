import { REASON_MIN, WAIT_MS, UNLOCK_MS } from './config.js';
import { reasonLength } from './gate-logic.js';
import { send } from './api.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const RING = 2 * Math.PI * 108;

let action;
try {
  action = JSON.parse(decodeURIComponent(location.hash.slice(1)));
} catch {
  action = null;
}

const RECORDED = '理由は記録に残ります。';
const COPY = {
  unlock: {
    title: '一時解除まで',
    after: `実行すると ${UNLOCK_MS / 60000} 分だけ迂回が止まり、自動で戻ります。戻るときに開いているタブも迂回します。${RECORDED}`,
  },
  remove: { title: '削除まで', after: `実行すると「${action?.pattern}」を迂回しなくなります。${RECORDED}` },
  setRedirect: { title: '変更まで', after: `実行するとリダイレクト先が「${action?.url}」に変わります。${RECORDED}` },
};
const copy = COPY[action?.type] ?? { title: '解除まで', after: '' };
$('title').textContent = copy.title;
$('after').textContent = copy.after;
document.title = `Detour: ${copy.title}`;
$('progress').style.strokeDasharray = RING;

let remainingMs = WAIT_MS;
let timer;

function setNotice(text, isError = true) {
  $('notice').textContent = text;
  $('notice').className = isError ? 'error' : 'note';
}

function update() {
  const sec = Math.ceil(remainingMs / 1000);
  const time = `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
  $('timer').textContent = time;
  $('progress').style.strokeDashoffset = RING * (remainingMs / WAIT_MS);

  const len = reasonLength($('reason').value);
  const short = REASON_MIN - len;
  $('count').textContent = `${len} / ${REASON_MIN} 文字`;

  const button = $('complete');
  button.disabled = remainingMs > 0 || short > 0;
  button.textContent = remainingMs > 0 ? `あと ${time}` : short > 0 ? `あと ${short} 文字` : '実行する';
}

async function tick() {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) {
    setNotice('画面から離れています。');
    return;
  }
  try {
    const r = await send({ type: 'gateBeat' });
    setNotice(r.reset ? '画面から離れたので、最初から数え直しています。' : '');
    remainingMs = r.remainingMs;
    update();
  } catch (e) {
    setNotice(e.message);
  }
}

async function start() {
  try {
    const r = await send({ type: 'gateStart', action });
    remainingMs = r.remainingMs;
    update();
    timer = setInterval(tick, 1000);
  } catch (e) {
    setNotice(e.message);
    $('reason').disabled = true;
  }
}

$('reason').addEventListener('input', update);
$('reason').addEventListener('paste', (ev) => ev.preventDefault()); // 定型文の貼り付けで済ませない

$('complete').addEventListener('click', async () => {
  try {
    await send({ type: 'gateComplete', reason: $('reason').value });
    clearInterval(timer);
    setNotice('実行しました。', false);
    setTimeout(() => (location.href = 'options.html'), 1500);
  } catch (e) {
    setNotice(e.message);
  }
});

$('cancel').addEventListener('click', () => send({ type: 'gateCancel' }));

update();
start();
