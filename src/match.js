// 登録パターンの正規化・DNR ルールへの変換・URL 照合。
// DNR（通常のページ遷移）と JS 照合（SPA 遷移・開いているタブ）で同じ判定になるよう、ここに集約する。

const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/;

/**
 * "youtube.com" → ドメイン（サブドメイン含む）
 * "youtube.com/shorts/*" → パス前方一致（* は任意の文字列）
 * 読めない入力は null。
 */
export function normalizeEntry(input) {
  let s = String(input ?? '').trim();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const slash = s.indexOf('/');
  const host = (slash === -1 ? s : s.slice(0, slash))
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^\*\./, '')
    .replace(/^www\./, '');
  const path = slash === -1 ? '' : s.slice(slash);
  if (!DOMAIN_RE.test(host)) return null;
  if (path === '' || path === '/' || path === '/*') return { kind: 'domain', host, pattern: host };
  // urlFilter の予約文字はパスに書かせない
  if (/[|^]/.test(path)) return null;
  return { kind: 'path', host, path, pattern: host + path };
}

/** パターンのホスト（サブドメイン含む）へのアクセス許可として求める origin */
export function originsFor(pattern) {
  const e = normalizeEntry(pattern);
  return e ? [`*://${e.host}/*`, `*://*.${e.host}/*`] : [];
}

/**
 * redirect はリクエスト先へのアクセス許可が要る。許可のないパターンは、許可なしで効く block にする。
 * 許可を取り消されても素通しにならないようにするため。
 */
export function buildRules(patterns, redirect, granted = new Set()) {
  return patterns.flatMap((pattern, i) => {
    const e = normalizeEntry(pattern);
    if (!e) return [];
    const cond = e.kind === 'domain' ? { requestDomains: [e.host] } : { urlFilter: `||${e.host}${e.path}` };
    const mainAction = granted.has(pattern) ? { type: 'redirect', redirect } : { type: 'block' };
    return [
      { id: i * 2 + 1, priority: 1, action: mainAction, condition: { ...cond, resourceTypes: ['main_frame'] } },
      // 埋め込み（iframe）はリダイレクト先を小窓に出しても意味がないので止めるだけ
      { id: i * 2 + 2, priority: 1, action: { type: 'block' }, condition: { ...cond, resourceTypes: ['sub_frame'] } },
    ];
  });
}

const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

export function matchesUrl(pattern, url) {
  const e = normalizeEntry(pattern);
  if (!e) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h !== e.host && !h.endsWith('.' + e.host)) return false;
  if (e.kind === 'domain') return true;
  const re = new RegExp('^' + e.path.split('*').map(escapeRe).join('.*'), 'i');
  return re.test(u.pathname + u.search);
}

export const matchesAny = (patterns, url) => patterns.some((p) => matchesUrl(p, url));

/** リダイレクト先として使えなければ理由を返す */
export function validateRedirect(url, patterns) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'URL として読めません';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'http または https の URL を指定してください';
  if (matchesAny(patterns, url)) return '登録済みのパターンに一致する URL はリダイレクト先にできません';
  return null;
}
