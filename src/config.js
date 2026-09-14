// 解除フローの強さ。弱めたくなったら、ここを書き換えて入れ直すこと自体が手間になるようにしてある
export const WAIT_MS = 30 * 60 * 1000;
export const UNLOCK_MS = 15 * 60 * 1000;
export const REASON_MIN = 100;
// 解除ページからの心拍がこれ以上途切れたら、待ち時間を最初からやり直す
export const BEAT_GAP_MS = 5 * 1000;
