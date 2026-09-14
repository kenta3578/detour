export async function send(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (res?.error) throw new Error(res.error);
  return res;
}

export const gateUrl = (action) => chrome.runtime.getURL('src/gate.html') + '#' + encodeURIComponent(JSON.stringify(action));

export const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
