import test from "node:test";
import assert from "node:assert/strict";
import {
  localDate,
  addDays,
  score,
  record,
  accuracy,
  selectQuestions,
  selectWeak,
  weakTopics,
  filterQuestions,
} from "../js/srs.js";
const day = "2026-11-10";
test("端末ローカル日付と月・年・うるう日の加算", () => {
  assert.equal(localDate(new Date(2026, 10, 10, 0, 1)), day);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});
test("できた：初回3日後、全stage、上限4", () => {
  let p;
  for (const [stage, due] of [
    [1, "2026-11-13"],
    [2, "2026-11-17"],
    [3, "2026-11-24"],
    [4, "2026-12-10"],
    [4, "2026-12-10"],
  ]) {
    p = score(p, "ok", day);
    assert.equal(p.stage, stage);
    assert.equal(p.due, due);
  }
  assert.equal(p.ok, 5);
});
test("あやふや：stage維持、未学習は0、3日後", () => {
  for (const stage of [0, 1, 2, 3, 4]) {
    const p = score({ stage }, "unsure", day);
    assert.equal(p.stage, stage);
    assert.equal(p.due, "2026-11-13");
    assert.equal(p.unsure, 1);
  }
  assert.equal(score(undefined, "unsure", day).stage, 0);
});
test("できなかった：stage0、翌日", () => {
  const p = score({ stage: 4 }, "ng", day);
  assert.equal(p.stage, 0);
  assert.equal(p.due, "2026-11-11");
  assert.equal(p.ng, 1);
  assert.equal(p.last, day);
  assert.equal(p.lastResult, "ng");
});
test("4択あやふやへの置換は初回・既存記録とも二重計上しない", () => {
  for (const previous of [
    undefined,
    {
      stage: 3,
      ok: 4,
      unsure: 2,
      ng: 1,
      due: day,
      last: day,
      lastResult: "ng",
    },
  ]) {
    const base = { progress: previous ? { q: previous } : {}, studyDays: [] };
    const first = record(base, "q", "ok", day);
    const changed = record(first, "q", "unsure", day, previous);
    assert.equal(changed.progress.q.ok, previous?.ok || 0);
    assert.equal(changed.progress.q.unsure, (previous?.unsure || 0) + 1);
    assert.equal(changed.progress.q.stage, previous?.stage || 0);
    assert.equal(changed.progress.q.due, "2026-11-13");
    assert.deepEqual(changed.studyDays, [day]);
    assert.deepEqual(base.studyDays, []);
  }
});
const qs = [
  { id: "future", topic: "A", difficulty: 1 },
  { id: "newhard", topic: "B", difficulty: 3 },
  { id: "due", topic: "A", difficulty: 2 },
  { id: "old", topic: "B", difficulty: 3 },
  { id: "neweasy", topic: "A", difficulty: 1 },
  { id: "future2", topic: "A", difficulty: 1 },
];
const ps = {
  future: { due: "2026-11-12", ok: 2, unsure: 0, ng: 0, lastResult: "ok" },
  future2: { due: "2026-11-13", ok: 0, unsure: 1, ng: 0, lastResult: "unsure" },
  due: { due: day, ok: 1, ng: 0, unsure: 0, lastResult: "ok" },
  old: { due: "2026-11-01", ok: 0, ng: 2, unsure: 0, lastResult: "ng" },
};
test("期限超過→未学習の難易度順→将来期限順", () =>
  assert.deepEqual(
    selectQuestions(qs, ps, day, 6, () => 0.5).map((q) => q.id),
    ["old", "due", "neweasy", "newhard", "future", "future2"],
  ));
test("同難度の未学習は注入乱数でシャッフル", () => {
  let n = 0;
  assert.deepEqual(
    selectQuestions(
      [
        { id: "a", difficulty: 1 },
        { id: "b", difficulty: 1 },
      ],
      {},
      day,
      2,
      () => [0.9, 0.1][n++],
    ).map((q) => q.id),
    ["b", "a"],
  );
});
test("苦手論点の率と論点内順序、未学習論点は除外", () => {
  assert.equal(weakTopics(qs, ps)[0].topic, "B");
  assert.deepEqual(
    selectWeak(qs, ps, day, 3, () => 0.5).map((q) => q.id),
    ["old", "newhard", "due"],
  );
  assert.deepEqual(weakTopics(qs, {}), []);
});
test("正答率はあやふやを分母のみに含む", () => {
  assert.equal(accuracy([{ ok: 2, unsure: 1, ng: 1 }]), 0.5);
  assert.equal(accuracy([]), 0);
});
test("間違い・ブックマーク・要確認の条件を交差", () => {
  assert.deepEqual(
    filterQuestions(
      qs,
      ps,
      ["old", "future2"],
      { old: {} },
      { wrong: true, bookmark: true, flag: true },
    ).map((q) => q.id),
    ["old"],
  );
});
