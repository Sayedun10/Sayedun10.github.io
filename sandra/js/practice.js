import { state, save, idb } from "./store.js";
import { $, $$, esc, award, toast, back, beep, confetti } from "./ui.js";
import { QUESTIONS, CATEGORIES } from "./content.js";
import { quizFromCards, generateCards, shuffle } from "./notes.js";

export async function renderPractice(el, _p, params) {
  if (params.get("deck") || params.get("file")) return fromNotes(el, params);
  const pre = params.get("cat");
  const decks = (await idb.all("decks")).filter((d) => !d.builtin);
  el.innerHTML = `
  <section class="page-head wrap"><p class="eyebrow"><span class="dot"></span>Q-Bank</p>
    <h1 class="display md">Think like the <em>NCLEX</em> thinks.</h1>
    <p class="lede">Every question asks one thing: what is the safest, most important action? Read the rationale even when you get it right.</p></section>
  <section class="wrap narrow">
    <div class="card-form">
      <h3>Client-needs areas</h3>
      <div class="chips" id="cats">${CATEGORIES.map((c, i) => { const n = QUESTIONS.filter((q) => q.c === i).length; return `<label class="chip"><input type="checkbox" value="${i}" ${pre === null || +pre === i ? "checked" : ""}><span>${esc(c)} <i>${n}</i></span></label>`; }).join("")}</div>
      <h3>How many?</h3>
      <div class="seg" id="len">${[5, 10, 20].map((n) => `<label><input type="radio" name="len" value="${n}" ${n === 10 ? "checked" : ""}><span>${n}</span></label>`).join("")}<label><input type="radio" name="len" value="999"><span>All</span></label></div>
      <button class="btn primary" id="go">Start practice</button>
    </div>
    ${decks.length ? `<div class="card-form"><h3>Quiz me on my own notes</h3><p class="small">Multiple choice built from one of your decks.</p>
      <div class="row"><select id="myDeck">${decks.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select><a class="btn" id="goMine">Start</a></div></div>` : ""}
  </section>`;
  $("#go").onclick = () => {
    const cats = $$("#cats input:checked").map((c) => +c.value); if (!cats.length) return toast("Pick at least one area.");
    const n = +$("input[name=len]:checked").value;
    run(el, shuffle(QUESTIONS.filter((q) => cats.includes(q.c))).slice(0, n), "Q-Bank");
  };
  if ($("#goMine")) $("#goMine").onclick = () => (location.hash = `#/practice?deck=${$("#myDeck").value}`);
}

async function fromNotes(el, params) {
  let cards, title;
  if (params.get("deck")) { const d = await idb.get("decks", params.get("deck")); cards = (await idb.byDeck(params.get("deck"))).filter((c) => c.front); title = d?.name || "My deck"; }
  else { const f = await idb.get("files", params.get("file")); cards = generateCards(f?.text || "").map((c) => ({ ...c, source: f.name })); title = f?.name || "My notes"; }
  const qs = quizFromCards(cards, 10);
  if (!qs.length) { el.innerHTML = `<section class="page-head wrap">${back("#/practice", "Q-Bank")}<h1 class="display sm">Not enough to quiz yet</h1><p class="lede">A quiz needs at least 4 cards. Add more cards to this deck first.</p></section>`; return; }
  run(el, qs, title);
}

function run(el, qs, title) {
  let i = 0, right = 0; const byCat = {}; const misses = [];
  el.innerHTML = `<section class="page-head wrap tight">${back("#/practice", "Q-Bank")}<h1 class="display sm">${esc(title)}</h1></section>
    <section class="wrap narrow"><div class="studybar"><div class="studybar-fill" id="qb"></div></div><div id="qstage"></div></section>`;
  const show = () => {
    $("#qb").style.width = (i / qs.length) * 100 + "%";
    const q = qs[i];
    if (!q) return finish();
    const order = shuffle(q.o.map((_, k) => k));
    const sata = q.t === "sata";
    $("#qstage").innerHTML = `<article class="qcard">
      <div class="q-top"><span class="label">${q.mine ? "From your notes" : esc(CATEGORIES[q.c])}</span><span class="label">${i + 1} / ${qs.length}</span></div>
      <h2 class="q-stem">${esc(q.q)}</h2>${sata ? `<p class="small sata">Select all that apply</p>` : ""}
      <div class="opts" role="${sata ? "group" : "radiogroup"}">${order.map((k, n) => `<label class="opt"><input type="${sata ? "checkbox" : "radio"}" name="o" value="${k}"><span class="opt-l">${"ABCDEF"[n]}</span><span class="opt-t">${esc(q.o[k])}</span></label>`).join("")}</div>
      <div class="q-foot"><button class="btn primary" id="sub" disabled>Submit</button></div>
      <div id="rat"></div></article>`;
    const sub = $("#sub");
    $$(".opt input").forEach((inp) => (inp.onchange = () => (sub.disabled = !$$(".opt input:checked").length)));
    sub.onclick = () => {
      const chosen = $$(".opt input:checked").map((x) => +x.value).sort();
      const ans = (sata ? [...q.a] : [q.a]).sort();
      const ok = chosen.length === ans.length && chosen.every((v, k) => v === ans[k]);
      $$(".opt").forEach((o) => { const v = +o.querySelector("input").value; o.classList.add(ans.includes(v) ? "right" : chosen.includes(v) ? "wrong" : "dim"); o.querySelector("input").disabled = true; });
      if (ok) right++; else misses.push(q);
      if (!q.mine) { const s = (state.qstats[q.c] ||= { right: 0, total: 0 }); s.total++; if (ok) s.right++; (byCat[q.c] ||= [0, 0])[1]++; if (ok) byCat[q.c][0]++; save(); }
      beep(ok); award(ok ? 10 : 3, "q");
      $("#rat").innerHTML = `<div class="rationale ${ok ? "ok" : "no"}"><b>${ok ? "Correct." : sata ? "Not quite. Every correct option has to be selected, and nothing else." : "Not this time."}</b><p>${esc(q.r)}</p></div>`;
      sub.textContent = i + 1 < qs.length ? "Next question" : "See results"; sub.disabled = false;
      sub.onclick = () => { i++; show(); scrollTo({ top: 0, behavior: "smooth" }); };
      sub.focus();
    };
  };
  const finish = () => {
    const pct = Math.round((right / qs.length) * 100);
    if (pct >= 80) confetti();
    $("#qstage").innerHTML = `<div class="finish"><div class="finish-score">${pct}<small>%</small></div><h2>${pct >= 80 ? "That's passing-standard thinking." : pct >= 60 ? "Solid. The rationales are where the points are." : "Every miss here is one you won't miss on test day."}</h2>
      <p>${right} of ${qs.length} correct.</p>
      ${misses.length ? `<details class="addcard"><summary>Review the ${misses.length} you missed</summary>${misses.map((q) => `<div class="miss"><b>${esc(q.q)}</b><p>Answer: ${esc((q.t === "sata" ? q.a : [q.a]).map((k) => q.o[k]).join("; "))}</p><p class="small">${esc(q.r)}</p></div>`).join("")}</details>` : ""}
      <div class="cta center"><a class="btn primary" href="#/practice">New set</a><a class="btn" href="#/wall">See my accuracy</a></div></div>`;
  };
  show();
}
