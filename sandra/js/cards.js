import { idb, uid, save, state } from "./store.js";
import { $, $$, esc, award, toast, back, beep, confetti } from "./ui.js";

const DAY = 864e5;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// SM-2 style scheduling. grade: 0 again, 1 hard, 2 good, 3 easy.
export function schedule(c, grade) {
  let { ivl = 0, ease = 2.5, reps = 0 } = c;
  if (grade === 0) return { ...c, reps: 0, ivl: 0, ease: Math.max(1.3, ease - 0.2), due: Date.now() + 10 * 60e3, lapses: (c.lapses || 0) + 1 };
  if (reps === 0) ivl = [0, 1, 1, 3][grade];
  else if (reps === 1) ivl = [0, 2, 3, 5][grade];
  else ivl = Math.round(ivl * [0, 1.2, ease, ease * 1.35][grade]);
  ease = Math.max(1.3, ease + [0, -0.15, 0, 0.15][grade]);
  return { ...c, reps: reps + 1, ivl, ease, due: startOfToday() + ivl * DAY };
}
export function intervalLabel(c, grade) {
  const n = schedule(c, grade); if (grade === 0) return "10 min";
  return n.ivl === 1 ? "1 day" : n.ivl < 31 ? n.ivl + " days" : Math.round(n.ivl / 30) + " mo";
}
const isDue = (c) => (c.due || 0) <= Date.now() + 60e3;
export async function dueCount() { return (await idb.all("cards")).filter(isDue).length; }

export async function renderCards(el, [deckId]) {
  if (deckId) return study(el, deckId);
  const decks = await idb.all("decks"); const cards = await idb.all("cards");
  const by = {}; for (const c of cards) (by[c.deck] ||= []).push(c);
  const mine = decks.filter((d) => !d.builtin).sort((a, b) => b.created - a.created), starters = decks.filter((d) => d.builtin);
  const allDue = cards.filter(isDue).length;
  el.innerHTML = `
  <section class="page-head wrap"><p class="eyebrow"><span class="dot"></span>Flash Rounds</p>
    <h1 class="display md">See it right before <em>you'd forget it</em>.</h1>
    <p class="lede">Rate each card honestly. Cards you miss come back in minutes, cards you know drift out to days and weeks.</p>
    <div class="cta"><a class="btn primary" href="#/cards/due">Review everything due <span class="pill">${allDue}</span></a><button class="btn" id="newDeckBtn">New deck</button></div></section>
  <section class="wrap"><div class="sec-head"><span class="num">01</span><h2>Your decks</h2></div>
    ${mine.length ? `<div class="decks">${mine.map((d) => deckTile(d, by[d.id] || [])).join("")}</div>` : `<div class="empty">No decks of your own yet. <a href="#/chart">Upload notes in My Chart</a> and they turn into a deck in one click.</div>`}</section>
  <section class="wrap"><div class="sec-head"><span class="num">02</span><h2>Starter decks</h2><p>High-yield NCLEX basics to get going.</p></div>
    <div class="decks">${starters.map((d) => deckTile(d, by[d.id] || [])).join("")}</div></section>`;
  $("#newDeckBtn").onclick = async () => {
    const name = prompt("Name the new deck"); if (!name) return;
    const id = uid(); await idb.put("decks", { id, name, color: "teal", created: Date.now() }); location.hash = `#/cards/${id}?edit=1`;
  };
  $$("[data-deldeck]").forEach((b) => (b.onclick = async (e) => {
    e.preventDefault(); if (!confirm("Delete this deck and all its cards?")) return;
    const id = b.dataset.deldeck; for (const c of by[id] || []) await idb.del("cards", c.id); await idb.del("decks", id); renderCards(el, []);
  }));
}

const deckTile = (d, cs) => {
  const due = cs.filter(isDue).length, learned = cs.filter((c) => c.reps >= 2).length;
  return `<div class="deck c-${d.color || "teal"}">
    <div class="deck-top"><h3>${esc(d.name)}</h3>${d.builtin ? "" : `<button class="icon-btn" data-deldeck="${d.id}" aria-label="Delete deck">✕</button>`}</div>
    <div class="deck-meta"><span><b>${cs.length}</b> cards</span><span><b>${due}</b> due</span><span><b>${cs.length ? Math.round((learned / cs.length) * 100) : 0}%</b> learned</span></div>
    <div class="deck-acts"><a class="btn sm primary" href="#/cards/${d.id}">Study</a><a class="btn sm ghost" href="#/games/match?deck=${d.id}">Pair game</a><a class="btn sm ghost" href="#/practice?deck=${d.id}">Quiz</a></div></div>`;
};

async function study(el, deckId) {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const deck = deckId === "due" ? { name: "Everything due", id: "due" } : await idb.get("decks", deckId);
  if (!deck) return (location.hash = "#/cards");
  let cards = deckId === "due" ? await idb.all("cards") : await idb.byDeck(deckId);
  const all = cards;
  let queue = cards.filter(isDue).sort((a, b) => (a.due || 0) - (b.due || 0));
  if (deckId === "due") queue = queue.slice(0, 60);
  let done = 0, right = 0, shown = false, cur; const lapsed = new Set();
  const total = () => done + queue.length;

  el.innerHTML = `<section class="page-head wrap tight">${back("#/cards", "Flash Rounds")}
    <h1 class="display sm">${esc(deck.name)}</h1></section>
    <section class="wrap narrow">
      <div class="studybar"><div class="studybar-fill" id="sb"></div></div>
      <div id="stage"></div>
      ${deckId !== "due" ? `<details class="addcard" ${params.get("edit") ? "open" : ""}><summary>Add a card to this deck</summary>
        <label class="field">Front<textarea id="aF" rows="2"></textarea></label><label class="field">Back<textarea id="aB" rows="2"></textarea></label>
        <button class="btn sm primary" id="aGo">Add</button></details>
        <details class="addcard"><summary>All cards in this deck (${all.length})</summary><ol class="cardlist">${all.map((c) => `<li><b>${c.front ? esc(c.front) : "[image]"}</b><span>${esc(c.back)}</span></li>`).join("")}</ol></details>` : ""}
    </section>`;
  if ($("#aGo")) $("#aGo").onclick = async () => {
    const f = $("#aF").value.trim(), b = $("#aB").value.trim(); if (!f || !b) return toast("Fill both sides.");
    const c = { id: uid(), deck: deckId, front: f, back: b, kind: "term", due: 0, ivl: 0, ease: 2.5, reps: 0 };
    await idb.put("cards", c); queue.push(c); $("#aF").value = $("#aB").value = ""; toast("Added."); if (!cur) next();
  };

  const key = (e) => {
    if (e.target.matches("input,textarea")) return;
    if (!cur) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!shown) flip(); }
    if (shown && "1234".includes(e.key)) rate(+e.key - 1);
  };
  document.addEventListener("keydown", key);
  document.addEventListener("leave", () => document.removeEventListener("keydown", key), { once: true });

  async function next() {
    $("#sb").style.width = total() ? (done / total()) * 100 + "%" : "100%";
    cur = queue.shift(); shown = false;
    if (!cur) {
      $("#stage").innerHTML = `<div class="finish"><div class="finish-ico">✓</div><h2>${done ? "Rounds complete." : "Nothing due here."}</h2>
        <p>${done ? `${done} reviews, ${right} remembered first try. ` : ""}${done ? "Your future self thanks you." : "Come back later, or try a game."}</p>
        <div class="cta center"><a class="btn primary" href="#/cards">Back to decks</a><a class="btn" href="#/games">Break room</a></div></div>`;
      if (done >= 10) confetti();
      return;
    }
    let front = esc(cur.front);
    if (cur.image) { const f = await idb.get("files", cur.image); if (f?.blob) front = `<img src="${URL.createObjectURL(f.blob)}" alt="">`; }
    front = front.replace(/_____/g, '<span class="blank">?</span>');
    $("#stage").innerHTML = `<div class="flip" id="flip" tabindex="0" role="button" aria-label="Flip card">
      <div class="flip-in"><div class="face front"><span class="face-l">${cur.source ? esc(cur.source) : "Question"}</span><div class="face-t">${front}</div><span class="face-hint">tap or press space</span></div>
      <div class="face back"><span class="face-l">Answer</span><div class="face-t">${esc(cur.back)}</div></div></div></div>
      <div class="rates" id="rates" hidden>${["Again", "Hard", "Good", "Easy"].map((l, i) => `<button class="rate r${i}" data-g="${i}"><b>${l}</b><span>${intervalLabel(cur, i)}</span><kbd>${i + 1}</kbd></button>`).join("")}</div>
      <p class="small center muted">${queue.length + 1} left in this round</p>`;
    $("#flip").onclick = flip;
    $$(".rate").forEach((b) => (b.onclick = () => rate(+b.dataset.g)));
  }
  function flip() { shown = true; $("#flip").classList.add("on"); $("#rates").hidden = false; }
  async function rate(g) {
    const updated = schedule(cur, g); await idb.put("cards", updated);
    if (g === 0) { lapsed.add(cur.id); queue.splice(Math.min(queue.length, 4), 0, updated); } else { done++; if (!lapsed.has(cur.id)) right++; }
    beep(g > 0); award(g > 0 ? 2 : 1, "cards"); next();
  }
  next();
}
