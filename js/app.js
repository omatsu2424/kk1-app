import {
  localDate,
  addDays,
  record,
  accuracy,
  totals,
  selectQuestions,
  selectWeak,
  weakTopics,
  filterQuestions,
} from "./srs.js";
import {
  load,
  save,
  defaults,
  validateData,
  recovery,
  brokenBackups,
  validateFilters,
} from "./store.js";
import { loadQuestions } from "./questions.js";
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  dialog = $("#dialog");
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const btn = (text, action, cls = "") =>
  `<button class="${esc(cls)}" data-action="${esc(action)}">${text}</button>`;
let data;
try {
  data = load();
} catch (e) {
  data = defaults();
  warn(
    "記録を読み込めません。元の保存内容は変更せず、初期状態で表示します。" +
      e.message,
  );
}
if (recovery.message) warn(recovery.message);
let guideOpen = false;
let screen = "home",
  questions = [],
  issues = [],
  persist = "確認中",
  session = [],
  at = 0,
  results = [],
  reveal = 0,
  selected = null,
  before,
  installEvent,
  reviewQuestion = null;
let filters = validateFilters(null, [], data.settings.sessionSize);
function warn(s) {
  $("#warning").hidden = false;
  $("#warning").textContent = s;
}
// 学習記録を保存し、失敗を画面に知らせる。
function commit() {
  try {
    save(data);
  } catch (e) {
    warn(
      "記録の保存に失敗しました。書き出しでバックアップしてください。" +
        e.message,
    );
  }
}
function appearance() {
  document.documentElement.dataset.theme = data.settings.theme;
  document.documentElement.style.setProperty(
    "--font",
    { S: "15px", M: "17px", L: "20px" }[data.settings.fontSize],
  );
}
const today = () => localDate();
function remaining() {
  const a = new Date(data.settings.examDate + "T12:00:00"),
    b = new Date(today() + "T12:00:00");
  return Math.ceil((a - b) / 86400000);
}
function overdueBackup() {
  return (
    Object.keys(data.progress).length &&
    (!data.lastExport || addDays(data.lastExport, 7) <= today())
  );
}
function go(s) {
  screen = s;
  reviewQuestion = null;
  render();
  window.scrollTo(0, 0);
}
const controlObserver = new ResizeObserver((entries) => {
  document.documentElement.style.setProperty(
    "--quiz-controls-height",
    entries[0].target.getBoundingClientRect().height + "px",
  );
});
// 現在の画面を描画し、出題中の表示領域を切り替える。
function render() {
  appearance();
  document.body.classList.toggle("quizzing", screen === "quiz");
  controlObserver.disconnect();
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) =>
      b.setAttribute(
        "aria-current",
        b.dataset.nav === screen ? "page" : "false",
      ),
    );
  const views = { home, conditions, quiz, result, progress, settings };
  app.innerHTML = views[screen]();
  const controls = $(".quiz-controls");
  if (controls) controlObserver.observe(controls);
}
// 期限と学習状況からホームの操作を組み立てる。
function home() {
  const due = questions.filter((q) => data.progress[q.id]?.due <= today()),
    weak = weakTopics(questions, data.progress);
  return `<section class="hero"><small>${esc(data.settings.examDate)} 試験まで</small><div><span class="big">${remaining()}</span> 日</div><p>今日の一問が、確かな力に。</p></section><h2 style="margin-top:22px">今日の学習</h2><div class="stats"><div class="card"><small>今日の復習</small><strong>${due.length} 問</strong></div><div class="card"><small>学習日数</small><strong>${data.studyDays.length} 日</strong></div><div class="card"><small>未学習</small><strong>${questions.filter((q) => !data.progress[q.id]).length} 問</strong></div><div class="card"><small>全体正答率</small><strong>${Math.round(accuracy(Object.values(data.progress)) * 100)}%</strong></div></div><div class="actions">${
    due.length
      ? btn(`▶ 今日の復習（${due.length}問）`, "due", "wide primary")
      : weak.length
        ? btn(
            `▶ 苦手な論点から出題<br><small style="color:inherit">${weak
              .slice(0, 2)
              .map((t) => esc(t.topic))
              .join("・")}</small>`,
            "weak",
            "wide primary",
          )
        : ""
  }${btn("▶ 新しい問題", "new", "wide " + (!due.length && !weak.length ? "primary" : ""))}${btn("⚙ 条件を選んで出題", "conditions", "wide")}</div>${overdueBackup() ? btn("記録のバックアップをおすすめします", "settings", "banner") : ""}`;
}
function candidates() {
  return filterQuestions(
    questions,
    data.progress,
    data.bookmarks,
    data.flags,
    filters,
  );
}
function checks(name, values, chosen) {
  return values
    .map(
      (v) =>
        `<label class="check"><input type="checkbox" name="${esc(name)}" value="${esc(v)}" ${chosen.includes(v) ? "checked" : ""}>${esc(v)}</label>`,
    )
    .join("");
}
// 記憶した出題条件と該当件数を表示する。
function conditions() {
  const subjects = [...new Set(questions.map((q) => q.subject))],
    topics = [
      ...new Set(
        questions
          .filter(
            (q) =>
              !filters.subjects.length || filters.subjects.includes(q.subject),
          )
          .map((q) => q.topic),
      ),
    ];
  return `<h2>出題条件</h2><form id="filters"><fieldset><legend>科目（未選択はすべて）</legend>${checks("subjects", subjects, filters.subjects)}</fieldset><fieldset><legend>論点（複数選択可）</legend>${checks("topics", topics, filters.topics)}</fieldset><label>難易度<select name="difficulty">${options(
    [
      ["", "すべて"],
      [1, "1 基本"],
      [2, "2 標準"],
      [3, "3 応用"],
    ],
    filters.difficulty,
  )}</select></label><label>形式<select name="type">${options(
    [
      ["", "すべて"],
      ["flash", "一問一答"],
      ["choice", "4択"],
      ["calc", "計算"],
      ["essay", "記述"],
    ],
    filters.type,
  )}</select></label>${[
    ["wrong", "間違えた問題だけ"],
    ["bookmark", "ブックマークだけ"],
    ["flag", "要確認をつけた問題だけ"],
  ]
    .map(
      ([k, v]) =>
        `<label class="check"><input name="${k}" type="checkbox" ${filters[k] ? "checked" : ""}>${v}</label>`,
    )
    .join("")}<label>1回の問題数<select name="size">${options(
    [5, 10, 20].map((x) => [x, x + "問"]),
    filters.size,
  )}</select></label><p id="count">該当 ${candidates().length} 問</p>${btn("この条件で始める", "start", "wide primary")}</form>`;
}
function options(list, value) {
  return list
    .map(
      ([v, t]) =>
        `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`,
    )
    .join("");
}
// 優先順に問題を選び、新しい学習を始める。
function start(qs, weak = false) {
  session = weak
    ? selectWeak(qs, data.progress, today(), Number(data.settings.sessionSize))
    : selectQuestions(
        qs,
        data.progress,
        today(),
        Number(
          screen === "conditions" ? filters.size : data.settings.sessionSize,
        ),
      );
  at = 0;
  results = [];
  resetQuestion();
  if (!session.length) {
    showDialog(
      "<h2>該当する問題がありません</h2><p>条件を変更してください。</p>" +
        btn("閉じる", "close", "wide"),
    );
    return;
  }
  go("quiz");
}
function resetQuestion() {
  reveal = 0;
  selected = null;
  before = undefined;
}
function answer(q) {
  return `<div class="card"><h3>答え${q.type === "essay" ? "・模範解答の要旨" : ""}</h3><div class="text">${esc(q.type === "choice" ? q.choices[q.answer] : q.answer)}</div>${q.explanation ? `<h3>解説</h3><div class="text">${esc(q.explanation)}</div>` : ""}</div>`;
}
function grades() {
  return `<div class="grades">${btn("できなかった", "grade-ng", "ng")}${btn("あやふや", "grade-unsure", "unsure")}${btn("できた", "grade-ok", "ok")}</div>`;
}
// 本文と固定操作領域を分け、すべての形式で片手操作しやすくする。
function quiz() {
  const q = session[at];
  let body = "",
    controls = "";
  if (q.type === "flash") {
    body = reveal
      ? answer(q)
      : btn("タップして答えを表示", "reveal", "card reveal");
    if (reveal) controls = grades();
  }
  if (q.type === "choice") {
    body = q.choices
      .map(
        (v, i) =>
          `<button class="choice ${selected !== null ? (i === q.answer ? "correct" : i === selected ? "incorrect" : "") : ""}" data-choice="${i}" ${selected !== null ? "disabled" : ""}>${i + 1}. ${esc(v)}</button>`,
      )
      .join("");
    if (selected !== null) {
      body += `<p role="status">${selected === q.answer ? "○ 正解" : "× 不正解"}</p>${answer(q)}`;
      controls =
        (selected === q.answer && results.at(-1)?.result === "ok"
          ? btn("あやふやだった", "replace", "wide")
          : "") + btn("次へ", "next", "wide primary");
    }
  }
  if (q.type === "calc") {
    if (reveal >= 1)
      body += `<div class="card"><h3>ヒント</h3><p class="text">${esc(q.hint)}</p></div>`;
    if (reveal >= 2)
      body += `<div class="card"><h3>解き方</h3><ol>${q.steps.map((s) => `<li class="text">${esc(s)}</li>`).join("")}</ol></div>`;
    if (reveal >= 3) {
      body += answer(q);
      controls = grades();
    } else
      controls =
        (reveal < 2
          ? btn(reveal === 0 ? "ヒント" : "解き方", "step", "wide")
          : "") +
        btn(reveal === 2 ? "答え" : "答えを直接開く", "direct", "wide primary");
  }
  if (q.type === "essay") {
    if (reveal >= 1)
      body = `<div class="chips">${q.keywords.map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div>`;
    if (reveal >= 2) {
      body += answer(q);
      controls = grades();
    } else
      controls = btn(
        reveal === 0 ? "キーワード" : "模範解答の要旨",
        "step",
        "wide primary",
      );
  }
  return `<div class="quiz-strip"><strong>${at + 1}/${session.length}</strong><span class="quiz-meta" title="${esc(q.subject + " ／ " + q.topic + " ／ 難易度 " + q.difficulty)}"><span class="quiz-subject">${esc(q.subject)}</span><span class="quiz-topic">${esc(q.topic)}</span><span class="quiz-difficulty">難易度${q.difficulty}</span></span><div class="quiz-icons"><button data-action="bookmark" aria-label="ブックマーク" aria-pressed="${data.bookmarks.includes(q.id)}">${data.bookmarks.includes(q.id) ? "★" : "☆"}</button><button data-action="flag" aria-label="要確認" aria-pressed="${!!data.flags[q.id]}">⚠</button><button data-action="stop" aria-label="やめる">✕</button></div></div><div class="quiz-content"><p class="question text">${esc(q.question)}</p>${body}</div>${controls ? `<div class="quiz-controls" aria-label="解答操作">${controls}</div>` : ""}`;
}
// 採点前の記録を残して自己採点を保存する。
function mark(result, replace = false) {
  const q = session[at];
  if (!replace)
    before = data.progress[q.id] ? { ...data.progress[q.id] } : undefined;
  data = record(data, q.id, result, today(), before);
  if (replace) results[results.length - 1] = { q, result };
  else results.push({ q, result });
  commit();
}
function next() {
  at++;
  resetQuestion();
  go(at < session.length ? "quiz" : "result");
}
// 今回の集計と復習対象を表示する。
function result() {
  const counts = totals(results.map((r) => ({ [r.result]: 1 }))),
    wrong = results.filter((r) => r.result !== "ok");
  return `<h2>今回の学習結果</h2><div class="card"><p>できた <strong>${counts.ok}</strong> 問</p><p>あやふや <strong>${counts.unsure}</strong> 問</p><p>できなかった <strong>${counts.ng}</strong> 問</p></div><h3>もう一度確認</h3>${wrong.length ? wrong.map((r) => btn(`${esc(r.q.topic)}<br>${esc(r.q.question.slice(0, 55))}`, `review:${r.q.id}`, "wide")).join("") : "<p>すべて「できた」でした。</p>"}${wrong.length ? btn("この問題をもう一度", "retry", "wide primary") : ""}${btn("ホームへ", "home", "wide")}`;
}
function rateRow(label, qs) {
  const ps = qs.map((q) => data.progress[q.id]).filter(Boolean),
    t = totals(ps),
    n = t.ok + t.unsure + t.ng,
    r = Math.round(accuracy(ps) * 100);
  return `<p>${esc(label)} <strong>${r}%</strong> <small>（${n}解答）</small></p><div class="bar"><span style="width:${r}%"></span></div>`;
}
// 科目・論点別の正答率と要確認一覧を表示する。
function progress() {
  const stages = Array(5).fill(0);
  Object.values(data.progress).forEach((p) => stages[p.stage]++);
  return `<h2>学習の進捗</h2><div class="card">試験まで <strong>${remaining()}日</strong> ／ 学習 <strong>${data.studyDays.length}日</strong>${rateRow("全体", questions)}</div>${[
    ...new Set(questions.map((q) => q.subject)),
  ]
    .map((s) => {
      const qs = questions.filter((q) => q.subject === s);
      return `<section class="card"><h3>${esc(s)}</h3>${rateRow(s, qs)}${[
        ...new Set(qs.map((q) => q.topic)),
      ]
        .map((t) =>
          rateRow(
            t,
            qs.filter((q) => q.topic === t),
          ),
        )
        .join("")}</section>`;
    })
    .join(
      "",
    )}<section class="card"><h3>復習 stage の分布</h3>${stages.map((n, i) => `<p>stage ${i}：${n}問</p>`).join("")}<p>未学習：${questions.filter((q) => !data.progress[q.id]).length}問</p></section><h3>要確認リスト</h3>${
    Object.entries(data.flags)
      .map(([id, f]) => {
        const q = questions.find((q) => q.id === id);
        return `<section class="card">${btn(`${esc(id)} ／ ${esc(q?.subject || "問題なし")} ／ ${esc(q?.topic || "")}<br>${esc(q?.question.slice(0, 50) || "")}<br>${esc(f.memo)}<br>${esc(f.date)}`, `review:${id}`, "wide")}${btn("要確認を解除", `unflag:${id}`, "wide")}</section>`;
      })
      .join("") || "<p>要確認の問題はありません。</p>"
  }`;
}
// 設定とバックアップ操作を表示する。
function settings() {
  return `<h2>設定</h2><form id="settings"><label>試験日<input type="date" name="examDate" value="${esc(data.settings.examDate)}" required></label><label>文字の大きさ<select name="fontSize">${options(
    [
      ["S", "小（15px）"],
      ["M", "中（17px）"],
      ["L", "大（20px）"],
    ],
    data.settings.fontSize,
  )}</select></label><label>テーマ<select name="theme">${options(
    [
      ["auto", "自動"],
      ["light", "ライト"],
      ["dark", "ダーク"],
    ],
    data.settings.theme,
  )}</select></label><label>1回の問題数の初期値<select name="sessionSize">${options(
    [5, 10, 20].map((x) => [x, x + "問"]),
    data.settings.sessionSize,
  )}</select></label></form><section class="card"><h3>記録のバックアップ</h3><p class="${overdueBackup() ? "danger" : ""}">最後に記録を書き出した日：${esc(data.lastExport || "未書き出し")}${overdueBackup() ? "<br>記録の書き出しをおすすめします。" : ""}</p>${btn("記録を書き出す（JSON）", "export", "wide primary")}<label>記録を読み込む（置き換え）<input id="import" type="file" accept=".json,application/json"></label>${btn("退避データを書き出す", "export-broken", "wide")}${btn("記録をリセット", "reset", "wide danger")}</section><section class="card"><h3>データの問題</h3><p>${issues.length}件</p>${issues.map((i) => `<p>${esc(i)}</p>`).join("")}<p>有効な問題：${questions.length}問</p><p>永続ストレージ：${esc(persist)}</p><p>アプリのバージョン：1.0.0</p></section>${btn("ホーム画面への追加方法", "guide", "wide")}`;
}
function showDialog(html) {
  dialog.innerHTML = html;
  dialog.showModal();
}
// 端末別の追加方法と利用可能な追加ボタンを表示する。
function guide() {
  guideOpen = true;
  showDialog(
    `<h2>ホーム画面に追加</h2><span class="share" aria-hidden="true">□↑ → ＋</span><h3>iPhone / iPad（Safari）</h3><p>Safari の共有ボタン（□↑）→「ホーム画面に追加」を選びます。</p><p>iPhoneでは、ホーム画面に追加せずにしばらく使わないと、学習の記録が消えることがあります</p><h3>Android（Chrome）</h3><p>メニュー（⋮）→「ホーム画面に追加」を選びます。</p>${installEvent ? btn("ホーム画面に追加", "install", "wide primary") : ""}${btn("あとで", "dismiss", "wide")}`,
  );
}
function review(id) {
  const q = questions.find((q) => q.id === id);
  if (q)
    showDialog(
      `<h2>${esc(q.topic)}</h2><p class="text">${esc(q.question)}</p>${answer(q)}${btn("閉じる", "close", "wide")}`,
    );
}
// ダウンロード開始と保存完了の確認は分けて扱う。
function download(raw, name) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// ボタンの操作を画面遷移や記録更新へ振り分ける。
async function act(action) {
  if (action.startsWith("review:")) return review(action.slice(7));
  if (action.startsWith("unflag:")) {
    delete data.flags[action.slice(7)];
    commit();
    render();
    return;
  }
  if (action.startsWith("grade-")) {
    mark(action.slice(6));
    next();
    return;
  }
  switch (action) {
    case "home":
    case "conditions":
    case "settings":
      go(action);
      break;
    case "due":
      start(questions.filter((q) => data.progress[q.id]?.due <= today()));
      break;
    case "new":
      start(questions.filter((q) => !data.progress[q.id]));
      break;
    case "weak":
      start(questions, true);
      break;
    case "start":
      start(candidates());
      break;
    case "reveal":
      reveal = 1;
      render();
      break;
    case "step":
      reveal++;
      render();
      break;
    case "direct":
      reveal = 3;
      render();
      break;
    case "replace":
      mark("unsure", true);
      render();
      break;
    case "next":
      next();
      break;
    case "stop":
      if (
        confirm("この学習を終了しますか？ 採点済みの記録は保存されています。")
      )
        go("result");
      break;
    case "retry":
      start(results.filter((r) => r.result !== "ok").map((r) => r.q));
      break;
    case "bookmark": {
      const id = session[at].id;
      data.bookmarks = data.bookmarks.includes(id)
        ? data.bookmarks.filter((x) => x !== id)
        : [...data.bookmarks, id];
      commit();
      render();
      break;
    }
    case "flag": {
      const id = session[at].id;
      showDialog(
        `<h2>要確認メモ</h2><label>メモ（任意）<textarea id="memo" rows="3">${esc(data.flags[id]?.memo || "")}</textarea></label>${btn("保存", "saveflag", "wide primary")}${data.flags[id] ? btn("解除", "removeflag", "wide") : ""}${btn("キャンセル", "close", "wide")}`,
      );
      break;
    }
    case "saveflag":
      data.flags[session[at].id] = { date: today(), memo: $("#memo").value };
      commit();
      dialog.close();
      render();
      break;
    case "removeflag":
      delete data.flags[session[at].id];
      commit();
      dialog.close();
      render();
      break;
    case "close":
      guideOpen = false;
      dialog.close();
      break;
    case "guide":
      guide();
      break;
    case "dismiss":
      guideOpen = false;
      data.installGuideDismissed = true;
      commit();
      dialog.close();
      break;
    case "install":
      await installEvent.prompt();
      installEvent = null;
      break;
    case "export": {
      download(
        JSON.stringify(data, null, 2),
        `kk1-backup-${today().replaceAll("-", "")}.json`,
      );
      showDialog(
        "<h2>ファイルを保存できましたか？</h2>" +
          btn("できた", "export-saved", "wide primary") +
          btn("できなかった", "close", "wide"),
      );
      break;
    }
    case "export-saved":
      data.lastExport = today();
      commit();
      dialog.close();
      render();
      break;
    case "export-broken": {
      const backups = brokenBackups();
      if (!backups.length) {
        showDialog(
          "<p>退避データはありません。</p>" + btn("閉じる", "close", "wide"),
        );
        break;
      }
      for (const backup of backups) download(backup.raw, backup.key + ".json");
      break;
    }
    case "reset":
      if (
        confirm(
          "学習記録・ブックマーク・要確認・設定をすべてリセットしますか？",
        ) &&
        confirm("最終確認：保存した記録を消去します。よろしいですか？")
      ) {
        data = defaults();
        commit();
        render();
      }
      break;
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.nav) {
    if (
      screen === "quiz" &&
      !confirm("学習を離れますか？ 採点済みの記録は保存済みです。")
    )
      return;
    go(b.dataset.nav);
  } else if (b.dataset.action) {
    e.preventDefault();
    act(b.dataset.action).catch((e) => warn(e.message));
  } else if (b.dataset.choice !== undefined && selected === null) {
    selected = Number(b.dataset.choice);
    mark(selected === session[at].answer ? "ok" : "ng");
    render();
  }
});
document.addEventListener("submit", (e) => e.preventDefault());
document.addEventListener("change", async (e) => {
  if (e.target.closest("#filters")) {
    const f = new FormData($("#filters"));
    filters = {
      subjects: f.getAll("subjects"),
      topics: f.getAll("topics"),
      difficulty: f.get("difficulty"),
      type: f.get("type"),
      size: Number(f.get("size")),
      wrong: f.has("wrong"),
      bookmark: f.has("bookmark"),
      flag: f.has("flag"),
    };
    const allowed = questions
      .filter(
        (q) => !filters.subjects.length || filters.subjects.includes(q.subject),
      )
      .map((q) => q.topic);
    filters.topics = filters.topics.filter((t) => allowed.includes(t));
    try {
      localStorage.setItem("kk1-filters-v1", JSON.stringify(filters));
    } catch {
      warn("出題条件を保存できませんでした。");
    }
    if (e.target.name === "subjects") render();
    else $("#count").textContent = `該当 ${candidates().length} 問`;
  }
  if (e.target.closest("#settings")) {
    if (!$("#settings").reportValidity()) return;
    const f = new FormData($("#settings"));
    data.settings = Object.fromEntries(f);
    data.settings.sessionSize = Number(data.settings.sessionSize);
    commit();
    appearance();
  }
  if (e.target.id === "import") {
    try {
      const file = e.target.files[0];
      if (!file) return;
      const imported = validateData(JSON.parse(await file.text()));
      if (confirm("現在の記録をファイルの内容に置き換えますか？")) {
        data = imported;
        commit();
        render();
      }
    } catch (err) {
      showDialog(
        `<h2>読み込めません</h2><p>${esc(err.message)}</p>${btn("閉じる", "close", "wide")}`,
      );
    }
  }
});
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  if (guideOpen && dialog.open) guide();
});
const loaded = await loadQuestions();
questions = loaded.questions;
issues = loaded.issues;
try {
  filters = validateFilters(
    JSON.parse(localStorage.getItem("kk1-filters-v1") || "{}"),
    questions,
    data.settings.sessionSize,
  );
} catch {}
render();
if (navigator.storage?.persist)
  navigator.storage
    .persist()
    .then((v) => {
      persist = v ? "許可済み" : "未許可";
      if (screen === "settings") render();
    })
    .catch(() => {
      persist = "利用不可";
    });
else persist = "非対応";
if (
  !data.installGuideDismissed &&
  navigator.standalone !== true &&
  !matchMedia("(display-mode: standalone)").matches
)
  guide();
let updateRequested = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .then((reg) => {
      function offer() {
        if (reg.waiting && navigator.serviceWorker.controller) {
          $("#update").hidden = false;
          $("#update").onclick = () => {
            updateRequested = true;
            reg.waiting?.postMessage("SKIP_WAITING");
          };
        }
      }
      offer();
      reg.addEventListener("updatefound", () => {
        reg.installing?.addEventListener("statechange", offer);
      });
    })
    .catch((e) => warn("オフライン機能を登録できませんでした。" + e.message));
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateRequested && !refreshing) {
      refreshing = true;
      location.reload();
    }
  });
}
