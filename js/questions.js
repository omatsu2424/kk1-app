// 問題の必須項目と形式別の項目を検証する。
export function questionErrors(q) {
  const e = [];
  if (!q || typeof q !== "object") return ["オブジェクトではありません"];
  for (const k of ["id", "subject", "topic", "question"])
    if (typeof q[k] !== "string" || !q[k].trim()) e.push(k);
  if (!/^[a-z]+-\d{3}$/.test(q.id || "")) e.push("id形式");
  if (!["flash", "choice", "calc", "essay"].includes(q.type)) e.push("type");
  if (![1, 2, 3].includes(q.difficulty)) e.push("difficulty");
  if (q.type === "choice") {
    if (
      !Array.isArray(q.choices) ||
      q.choices.length !== 4 ||
      q.choices.some((x) => typeof x !== "string" || !x)
    )
      e.push("choices");
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3)
      e.push("answer");
  } else if (typeof q.answer !== "string" || !q.answer.trim()) e.push("answer");
  if (q.explanation !== undefined && typeof q.explanation !== "string")
    e.push("explanation");
  if (q.type === "calc") {
    if (typeof q.hint !== "string" || !q.hint) e.push("hint");
    if (
      !Array.isArray(q.steps) ||
      !q.steps.length ||
      q.steps.some((x) => typeof x !== "string" || !x)
    )
      e.push("steps");
    const vs = Array.isArray(q.verify) ? q.verify : [q.verify];
    if (
      !vs.length ||
      vs.some(
        (v) => !v || typeof v.expr !== "string" || !Number.isFinite(v.expected),
      )
    )
      e.push("verify");
  }
  if (
    q.type === "essay" &&
    (!Array.isArray(q.keywords) ||
      !q.keywords.length ||
      q.keywords.some((x) => typeof x !== "string" || !x))
  )
    e.push("keywords");
  return e;
}
// 一覧にある問題を読み込み、不正な問題は報告して除外する。
export async function loadQuestions() {
  const questions = [],
    issues = [],
    seen = new Set();
  try {
    const r = await fetch("./questions/index.json");
    if (!r.ok) throw Error(r.status);
    const index = await r.json();
    for (const file of index.files) {
      try {
        const r = await fetch(`./questions/${file}`);
        if (!r.ok) throw Error(r.status);
        const rows = await r.json();
        if (!Array.isArray(rows)) throw Error("配列ではありません");
        for (const q of rows) {
          const e = questionErrors(q);
          if (seen.has(q?.id)) e.push("id重複");
          if (q?.id) seen.add(q.id);
          if (e.length) issues.push(`${q?.id || file}: ${e.join(", ")}`);
          else questions.push(q);
        }
      } catch (e) {
        issues.push(`${file}: ${e.message}`);
      }
    }
  } catch (e) {
    issues.push(`index.json: ${e.message}`);
  }
  return { questions, issues };
}
