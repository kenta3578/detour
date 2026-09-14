import { WAIT_MS, UNLOCK_MS, REASON_MIN, BEAT_GAP_MS } from './config.js';
import { normalizeEntry, buildRules, matchesUrl, matchesAny, validateRedirect } from './match.js';
import { startGate, beat, remaining, checkComplete } from './gate-logic.js';

const CFG = { waitMs: WAIT_MS, gapMs: BEAT_GAP_MS, reasonMin: REASON_MIN };
const BLOCKED_PAGE = '/src/blocked.html';
const LOG_MAX = 500;

const COMPLETE_ERRORS = {
  'no-gate': '解除フローが始まっていません',
  interrupted: '画面から離れたため、やり直しになりました',
  waiting: 'まだ待ち時間が残っています',
  'reason-short': `理由は ${REASON_MIN} 文字以上書いてください`,
};

const load = () => chrome.storage.local.get({ patterns: [], redirectUrl: '', unlockUntil: 0, log: [] });
const isUnlocked = (s, now = Date.now()) => s.unlockUntil > now;
const redirectHref = (s) => s.redirectUrl || chrome.runtime.getURL(BLOCKED_PAGE);

// ---- ルールの適用 ----

async function apply() {
  const s = await load();
  const unlocked = isUnlocked(s);
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const redirect = s.redirectUrl ? { url: s.redirectUrl } : { extensionPath: BLOCKED_PAGE };
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: current.map((r) => r.id),
    addRules: unlocked ? [] : buildRules(s.patterns, redirect),
  });
  if (unlocked) {
    await chrome.alarms.create('relock', { when: s.unlockUntil });
  } else {
    await chrome.alarms.clear('relock');
    await sweepTabs(s);
  }
}

// updateDynamicRules を並行に呼ぶと ID が衝突するので直列にする
let queue = Promise.resolve();
const scheduleApply = () => (queue = queue.then(apply).catch((e) => console.error('[detour] apply', e)));

/** ロックした時点で開いているタブも迂回させる */
async function sweepTabs(s) {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs.filter((t) => t.url && matchesAny(s.patterns, t.url)).map((t) => chrome.tabs.update(t.id, { url: redirectHref(s) })),
  );
}

/** DNR はリクエストを伴わない遷移（SPA の pushState・戻る/進むのキャッシュ）を拾えないので JS で補う */
async function onNavigated(d) {
  if (d.frameId !== 0) return;
  const s = await load();
  if (!isUnlocked(s) && matchesAny(s.patterns, d.url)) await chrome.tabs.update(d.tabId, { url: redirectHref(s) });
}

chrome.runtime.onInstalled.addListener(scheduleApply);
chrome.runtime.onStartup.addListener(scheduleApply);
chrome.storage.onChanged.addListener((_, area) => area === 'local' && scheduleApply());
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'relock') await chrome.storage.local.set({ unlockUntil: 0 });
});
chrome.webNavigation.onHistoryStateUpdated.addListener(onNavigated);
chrome.webNavigation.onCommitted.addListener(onNavigated);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ---- 設定の変更 ----

/** ブロックを弱める操作。解除フローを通ったときだけ実行する */
function validateAction(s, action) {
  switch (action?.type) {
    case 'unlock':
      return isUnlocked(s) ? 'すでに解除中です' : null;
    case 'remove':
      return s.patterns.includes(action.pattern) ? null : '登録されていないパターンです';
    case 'setRedirect':
      return validateRedirect(action.url, s.patterns);
    default:
      return '不明な操作です';
  }
}

async function perform(s, action, reason, now) {
  const next = { log: [...s.log, { at: now, action, reason: reason.trim() }].slice(-LOG_MAX) };
  if (action.type === 'unlock') next.unlockUntil = now + UNLOCK_MS;
  if (action.type === 'remove') next.patterns = s.patterns.filter((p) => p !== action.pattern);
  if (action.type === 'setRedirect') next.redirectUrl = action.url;
  await chrome.storage.local.set(next);
}

async function handle(msg) {
  const s = await load();
  const now = Date.now();
  const { gate } = await chrome.storage.session.get('gate');

  switch (msg?.type) {
    case 'getState':
      return {
        patterns: s.patterns,
        redirectUrl: s.redirectUrl,
        unlockUntil: s.unlockUntil,
        log: s.log.slice(-50).reverse(),
        now,
      };

    // 強める操作はすぐ反映する
    case 'add': {
      const e = normalizeEntry(msg.pattern);
      if (!e) throw new Error('ドメインか URL パターンとして読めません');
      if (s.patterns.includes(e.pattern)) throw new Error('登録済みです');
      if (s.redirectUrl && matchesUrl(e.pattern, s.redirectUrl)) {
        throw new Error('リダイレクト先がこのパターンに一致するため登録できません');
      }
      await chrome.storage.local.set({ patterns: [...s.patterns, e.pattern] });
      return { pattern: e.pattern };
    }
    case 'lockNow':
      await chrome.storage.local.set({ unlockUntil: 0 });
      return {};
    case 'setRedirect': {
      // 初回だけは解除フローなしで設定できる
      if (s.redirectUrl) throw new Error('リダイレクト先の変更は解除フローを通してください');
      const err = validateRedirect(msg.url, s.patterns);
      if (err) throw new Error(err);
      await chrome.storage.local.set({ redirectUrl: msg.url });
      return {};
    }

    // 弱める操作は解除フローを通す
    case 'gateStart': {
      const err = validateAction(s, msg.action);
      if (err) throw new Error(err);
      await chrome.storage.session.set({ gate: startGate(msg.action, now) });
      return { remainingMs: CFG.waitMs };
    }
    case 'gateBeat': {
      if (!gate) throw new Error(COMPLETE_ERRORS['no-gate']);
      const next = beat(gate, now, CFG);
      await chrome.storage.session.set({ gate: next });
      return { remainingMs: remaining(next, now, CFG), reset: next.startedAt !== gate.startedAt };
    }
    case 'gateComplete': {
      const code = checkComplete(gate, now, msg.reason, CFG);
      if (code) throw new Error(COMPLETE_ERRORS[code]);
      const err = validateAction(s, gate.action);
      if (err) throw new Error(err);
      await perform(s, gate.action, msg.reason, now);
      await chrome.storage.session.remove('gate');
      return {};
    }
    case 'gateCancel':
      await chrome.storage.session.remove('gate');
      return {};

    default:
      throw new Error('不明なメッセージです');
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  handle(msg).then(sendResponse, (e) => sendResponse({ error: e.message }));
  return true;
});
