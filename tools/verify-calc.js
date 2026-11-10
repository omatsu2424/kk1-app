import fs from "node:fs";
const base = new URL("../questions/", import.meta.url),
  index = JSON.parse(fs.readFileSync(new URL("index.json", base), "utf8"));
let failures = 0,
  count = 0;
function evaluate(expr) {
  const cleaned = expr.replace(/Math\.(round|floor|ceil|max|min)/g, "");
  if (!/^[\d\s.+\-*/(),]+$/.test(cleaned) || /\*\*|\/\/|\/\*/.test(cleaned))
    throw Error("許可されない式");
  return Function('"use strict";return (' + expr + ")")();
}
for (const f of index.files)
  for (const q of JSON.parse(fs.readFileSync(new URL(f, base), "utf8"))) {
    if (q.type !== "calc") continue;
    for (const v of Array.isArray(q.verify) ? q.verify : [q.verify]) {
      count++;
      try {
        const actual = evaluate(v.expr),
          answer = String(q.answer).replaceAll(",", ""),
          tokens = answer.match(/-?\d+(?:\.\d+)?/g) || [],
          ok =
            Number.isFinite(actual) &&
            Math.abs(actual - v.expected) <= 1e-6 &&
            tokens.some((t) => Number(t) === v.expected);
        console.log(
          `${ok ? "PASS" : "FAIL"} ${q.id} ${v.label || ""}: ${actual} / expected ${v.expected}`,
        );
        if (!ok) failures++;
      } catch (e) {
        failures++;
        console.error(q.id, e.message);
      }
    }
  }
console.log(`検算: ${count}項目 / 不一致${failures}件`);
process.exitCode = failures ? 1 : 0;
