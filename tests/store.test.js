import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  validateData,
  validDate,
  validateFilters,
  load,
  save,
  recovery,
  KEY,
} from "../js/store.js";
const progress = () => ({
  stage: 1,
  due: "2026-11-13",
  last: "2026-11-10",
  lastResult: "ok",
  ok: 1,
  unsure: 0,
  ng: 0,
});
const storage = () => {
  const values = {};
  return {
    getItem: (k) => values[k] ?? null,
    setItem: (k, v) => {
      values[k] = v;
    },
    values,
  };
};
test("不正IDをprogress・flags・bookmarksで拒否し、有効IDを許可", () => {
  for (const id of ['x" onclick="bad', "a b", "<img>", "日本語", ""])
    for (const kind of ["progress", "flags", "bookmarks"]) {
      const d = defaults();
      d[kind] =
        kind === "bookmarks"
          ? [id]
          : {
              [id]:
                kind === "progress"
                  ? progress()
                  : { date: "2026-11-10", memo: "" },
            };
      assert.throws(() => validateData(d));
    }
  const d = defaults();
  d.progress["A_1-2"] = progress();
  assert.equal(validateData(d), d);
});
test("mapとsettingsは非nullの通常オブジェクトのみ", () => {
  for (const field of ["progress", "flags", "settings"])
    for (const value of [1, 0, [], null, "text", true]) {
      const d = defaults();
      d[field] = value;
      assert.throws(() => validateData(d));
    }
});
test("stage・採点回数・lastResultを検証", () => {
  for (const [key, values] of Object.entries({
    stage: [-1, 5, 1.5, "1"],
    ok: [-1, 0.5, "0"],
    unsure: [-1],
    ng: [-1],
    lastResult: ["bad", null],
  }))
    for (const value of values) {
      const d = defaults();
      d.progress.q = { ...progress(), [key]: value };
      assert.throws(() => validateData(d));
    }
});
test("年月日が実在することを検証", () => {
  for (const day of ["2026-02-31", "2026-02-29", "2026-04-31", "2026-13-01"])
    assert.equal(validDate(day), false);
  assert.equal(validDate("2028-02-29"), true);
  for (const field of ["due", "last"]) {
    const d = defaults();
    d.progress.q = { ...progress(), [field]: "2026-02-31" };
    assert.throws(() => validateData(d));
  }
  const d = defaults();
  d.settings.examDate = "2026-02-31";
  assert.throws(() => validateData(d));
});
test("filtersは不正項目のみ初期値に戻す", () => {
  const qs = [{ subject: "財務", topic: "会計" }];
  assert.deepEqual(
    validateFilters(
      {
        subjects: 1,
        topics: ["会計"],
        difficulty: "9",
        type: "calc",
        size: "10",
        wrong: "false",
        bookmark: true,
        flag: 0,
      },
      qs,
      5,
    ),
    {
      subjects: [],
      topics: ["会計"],
      difficulty: "",
      type: "calc",
      size: 5,
      wrong: false,
      bookmark: true,
      flag: false,
    },
  );
  assert.deepEqual(
    validateFilters({ subjects: ["未知"], topics: [1] }, qs).subjects,
    [],
  );
  assert.equal(validateFilters(null, qs).size, 10);
});
test("破損JSONと形式不正を元文字列のまま退避する", () => {
  for (const raw of [
    "{broken",
    JSON.stringify({ ...defaults(), progress: 42 }),
  ]) {
    const s = storage();
    s.setItem(KEY, raw);
    assert.deepEqual(load(s), defaults());
    assert.match(recovery.message, /元のデータは退避しました/);
    const key = Object.keys(s.values).find((k) =>
      k.startsWith(KEY + "-broken-"),
    );
    assert.equal(s.getItem(key), raw);
    save(defaults(), s);
    assert.equal(s.getItem(key), raw);
  }
});
test("退避に失敗した間は通常保存で元データを上書きしない", () => {
  const s = storage();
  s.setItem(KEY, "{bad");
  const write = s.setItem;
  let blocked = true;
  s.setItem = (k, v) => {
    if (blocked && k !== KEY) throw Error("容量不足");
    write(k, v);
  };
  load(s);
  assert.throws(() => save(defaults(), s));
  assert.equal(s.getItem(KEY), "{bad");
  blocked = false;
  save(defaults(), s);
  assert.equal(JSON.parse(s.getItem(KEY)).version, 1);
  assert.ok(Object.values(s.values).includes("{bad"));
});
