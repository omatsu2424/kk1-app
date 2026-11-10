import fs from "node:fs";
import { questionErrors } from "../js/questions.js";
const root = new URL("../questions/", import.meta.url),
  index = JSON.parse(fs.readFileSync(new URL("index.json", root), "utf8")),
  seen = new Set();
let failed = 0,
  total = 0;
for (const file of index.files) {
  try {
    const qs = JSON.parse(fs.readFileSync(new URL(file, root), "utf8"));
    if (!Array.isArray(qs)) throw Error("配列ではない");
    const counts = { flash: 0, choice: 0, calc: 0, essay: 0 };
    for (const q of qs) {
      total++;
      const errors = questionErrors(q);
      if (seen.has(q.id)) errors.push("id重複");
      seen.add(q.id);
      counts[q.type]++;
      if (errors.length) {
        failed++;
        console.error(q.id, errors.join(", "));
      }
    }
    if (
      qs.length !== 10 ||
      counts.flash !== 3 ||
      counts.choice !== 3 ||
      counts.calc !== 2 ||
      counts.essay !== 2
    ) {
      failed++;
      console.error(file, "問題配分不一致", counts);
    }
    console.log(file, qs.length, "問", counts);
  } catch (e) {
    failed++;
    console.error(file, e.message);
  }
}
console.log(`形式検証: ${total}問 / エラー${failed}件`);
process.exitCode = failed ? 1 : 0;
