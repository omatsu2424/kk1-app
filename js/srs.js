export const INTERVALS = [1, 3, 7, 14, 30];
// 端末のローカル日付を保存形式にする。
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// 正午を基準に日数を加算する。
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n, 12));
}
// 自己採点から復習段階と次の期限を求める。
export function score(previous, result, today) {
  if (!["ok", "unsure", "ng"].includes(result)) throw Error("不正な採点");
  const p = { stage: 0, ok: 0, unsure: 0, ng: 0, ...previous };
  p.stage =
    result === "ok" ? Math.min(p.stage + 1, 4) : result === "ng" ? 0 : p.stage;
  p.due = addDays(today, result === "unsure" ? 3 : INTERVALS[p.stage]);
  p[result]++;
  p.last = today;
  p.lastResult = result;
  return p;
}
// 置き換えは採点前のスナップショットから再計算する。
export function record(data, id, result, today, previous) {
  if (arguments.length < 5) previous = data.progress[id];
  return {
    ...data,
    progress: { ...data.progress, [id]: score(previous, result, today) },
    studyDays: [...new Set([...data.studyDays, today])],
  };
}
// 採点結果を合計する。
export function totals(records) {
  return records.reduce(
    (a, p) => ({
      ok: a.ok + (p?.ok || 0),
      unsure: a.unsure + (p?.unsure || 0),
      ng: a.ng + (p?.ng || 0),
    }),
    { ok: 0, unsure: 0, ng: 0 },
  );
}
// 全回答に対する「できた」の割合を求める。
export function accuracy(records) {
  const t = totals(records),
    n = t.ok + t.unsure + t.ng;
  return n ? t.ok / n : 0;
}
// 指定された出題条件をすべて満たす問題を返す。
export function filterQuestions(qs, progress, bookmarks, flags, f = {}) {
  return qs.filter(
    (q) =>
      (!f.subjects?.length || f.subjects.includes(q.subject)) &&
      (!f.topics?.length || f.topics.includes(q.topic)) &&
      (!f.difficulty || q.difficulty === Number(f.difficulty)) &&
      (!f.type || q.type === f.type) &&
      (!f.wrong || ["ng", "unsure"].includes(progress[q.id]?.lastResult)) &&
      (!f.bookmark || bookmarks.includes(q.id)) &&
      (!f.flag || !!flags[q.id]),
  );
}
// 期限超過・未学習・将来期限の順で問題を選ぶ。
export function selectQuestions(
  qs,
  progress,
  today,
  size,
  random = Math.random,
) {
  return qs
    .map((q) => ({ q, r: random() }))
    .sort((a, b) => {
      const p = progress[a.q.id],
        r = progress[b.q.id];
      const group = (x) => (!x ? 1 : x.due <= today ? 0 : 2);
      const g = group(p) - group(r);
      return (
        g ||
        (!p && !r
          ? a.q.difficulty - b.q.difficulty || a.r - b.r
          : (p?.due || "").localeCompare(r?.due || ""))
      );
    })
    .slice(0, size)
    .map((x) => x.q);
}
// 解答済みの論点を正答率の低い順に並べる。
export function weakTopics(qs, progress) {
  const groups = new Map();
  for (const q of qs) {
    if (!groups.has(q.topic)) groups.set(q.topic, []);
    if (progress[q.id]) groups.get(q.topic).push(progress[q.id]);
  }
  return [...groups]
    .filter(([, ps]) => ps.length)
    .map(([topic, ps]) => ({ topic, rate: accuracy(ps) }))
    .sort((a, b) => a.rate - b.rate || a.topic.localeCompare(b.topic));
}
// 苦手な論点から優先して問題を集める。
export function selectWeak(qs, progress, today, size, random = Math.random) {
  return weakTopics(qs, progress)
    .flatMap((t) =>
      selectQuestions(
        qs.filter((q) => q.topic === t.topic),
        progress,
        today,
        qs.length,
        random,
      ),
    )
    .slice(0, size);
}
