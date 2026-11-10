export const KEY = "kk1-data-v1";
export const defaults = () => ({
  version: 1,
  progress: {},
  bookmarks: [],
  flags: {},
  studyDays: [],
  lastExport: null,
  installGuideDismissed: false,
  settings: {
    examDate: "2027-03-14",
    fontSize: "M",
    theme: "auto",
    sessionSize: 10,
  },
});
const plain = (value) =>
  value !== null &&
  typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;
export const validId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
// 日付の繰り上がりも調べ、存在しない日を拒否する。
export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}
// 読み込み元にかかわらず、記録全体を同じ基準で検証する。
export function validateData(d) {
  const fail = () => {
    throw Error("設定または記録の形式が不正です");
  };
  if (
    !plain(d) ||
    d.version !== 1 ||
    !plain(d.progress) ||
    !plain(d.flags) ||
    !plain(d.settings) ||
    !Array.isArray(d.bookmarks) ||
    !Array.isArray(d.studyDays)
  )
    fail();
  for (const [id, p] of Object.entries(d.progress)) {
    if (
      !validId(id) ||
      !plain(p) ||
      !Number.isInteger(p.stage) ||
      p.stage < 0 ||
      p.stage > 4 ||
      !validDate(p.due) ||
      !validDate(p.last) ||
      !["ok", "unsure", "ng"].includes(p.lastResult) ||
      ["ok", "unsure", "ng"].some((k) => !Number.isInteger(p[k]) || p[k] < 0)
    )
      fail();
  }
  if (
    d.bookmarks.some((id) => !validId(id)) ||
    d.studyDays.some((x) => !validDate(x)) ||
    Object.entries(d.flags).some(
      ([id, f]) =>
        !validId(id) ||
        !plain(f) ||
        !validDate(f.date) ||
        typeof f.memo !== "string",
    ) ||
    !validDate(d.settings.examDate) ||
    !["S", "M", "L"].includes(d.settings.fontSize) ||
    !["auto", "light", "dark"].includes(d.settings.theme) ||
    ![5, 10, 20].includes(d.settings.sessionSize) ||
    (d.lastExport !== null && !validDate(d.lastExport)) ||
    typeof d.installGuideDismissed !== "boolean"
  )
    fail();
  return d;
}
let pendingBroken = null;
let readBlocked = false;
export const recovery = { message: "" };
// 退避先へ書き込み、読み戻して確認するまで元データを保護する。
function archiveBroken(storage) {
  if (pendingBroken === null) return;
  let key = KEY + "-broken-" + new Date().toISOString().replace(/[:.]/g, "-");
  while (storage.getItem(key) !== null) key += "-1";
  storage.setItem(key, pendingBroken);
  if (storage.getItem(key) !== pendingBroken)
    throw Error("退避を確認できませんでした");
  pendingBroken = null;
}
export function load(storage = localStorage) {
  pendingBroken = null;
  readBlocked = false;
  recovery.message = "";
  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch (error) {
    readBlocked = true;
    throw error;
  }
  if (raw === null) return defaults();
  try {
    return validateData(JSON.parse(raw));
  } catch {
    pendingBroken = raw;
    try {
      archiveBroken(storage);
      recovery.message = "記録を読み込めませんでした。元のデータは退避しました";
    } catch {
      recovery.message =
        "記録を読み込めませんでした。退避に失敗したため、元のデータを保護して保存を停止しています";
    }
    return defaults();
  }
}
export function save(d, storage = localStorage) {
  if (readBlocked)
    throw Error("元の記録を取得できないため保存を停止しています");
  archiveBroken(storage);
  storage.setItem(KEY, JSON.stringify(d));
}
// 破損した文字列をそのまま書き出せるよう一覧を返す。
export function brokenBackups(storage = localStorage) {
  return Object.keys(storage)
    .filter((k) => k.startsWith(KEY + "-broken-"))
    .sort()
    .map((key) => ({ key, raw: storage.getItem(key) }));
}
// 不正な項目だけを初期値へ戻し、他の有効な条件は保持する。
export function validateFilters(value, questions, size = 10) {
  const d = {
    subjects: [],
    topics: [],
    difficulty: "",
    type: "",
    size,
    wrong: false,
    bookmark: false,
    flag: false,
  };
  if (!plain(value)) return d;
  for (const k of ["subjects", "topics"]) {
    const allowed = new Set(
      questions.map((q) => q[k === "subjects" ? "subject" : "topic"]),
    );
    if (
      Array.isArray(value[k]) &&
      value[k].every((x) => typeof x === "string" && allowed.has(x))
    )
      d[k] = value[k];
  }
  if (["", "1", "2", "3"].includes(value.difficulty))
    d.difficulty = value.difficulty;
  if (["", "flash", "choice", "calc", "essay"].includes(value.type))
    d.type = value.type;
  if ([5, 10, 20].includes(value.size)) d.size = value.size;
  for (const k of ["wrong", "bookmark", "flag"])
    if (typeof value[k] === "boolean") d[k] = value[k];
  return d;
}
