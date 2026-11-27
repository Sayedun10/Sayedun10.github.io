import { state, save, today, streak, idb, uid, persist, todayKey, exportBackup, importBackup } from "./store.js";
import { $, $$, esc, rank, ring, rhythmStrip, daysUntil, award, pin, toast, confetti, PINS, fmtSize, pick, back, beep } from "./ui.js";
import { CONFIG } from "./config.js";
import { STARTER_DECKS, AFFIRMATIONS, CATEGORIES } from "./content.js";
import { extractText, kindOf, generateCards } from "./notes.js";
import { renderCards, dueCount, intervalLabel } from "./cards.js";
import { renderPractice } from "./practice.js";
import { renderGames } from "./games.js";

const view = $("#view");

/* ---------------- First run: seed starter decks ---------------- */
async function seed() {
  if (await idb.get("kv", "seeded")) return;
  const now = Date.now();
  for (const d of STARTER_DECKS) {
    await idb.put("decks", { id: "b-" + d.id, name: d.name, color: d.color, builtin: true, created: now });
    await idb.putMany("cards", d.cards.map(([front, back], i) => ({ id: `b-${d.id}-${i}`, deck: "b-" + d.id, front, back, kind: "term", due: 0, ivl: 0, ease: 2.5, reps: 0 })));
  }
  await idb.put("kv", 1, "seeded");
}

/* ---------------- Router ---------------- */
const routes = {
  "": home, chart, cards: renderCards, practice: renderPractice, games: renderGames, wall,
};
async function route() {
  const [path, query] = (location.hash.replace(/^#\/?/, "") || "").split("?");
  const parts = path.split("/").filter(Boolean);
  const fn = routes[parts[0] || ""] || home;
  $$(".nav a, .tabbar a").forEach((a) => a.classList.toggle("on", (a.getAttribute("href").replace(/^#\/?/, "") || "") === (parts[0] || "")));
  document.dispatchEvent(new Event("leave"));
  view.classList.remove("enter"); void view.offsetWidth;
  await fn(view, parts.slice(1), new URLSearchParams(query || ""));
  view.classList.add("enter");
  if (!history.state?.keepScroll) scrollTo(0, 0);
}
addEventListener("hashchange", route);
// Clicking a link to the page you're already on restarts it (e.g. "New set" after a quiz).
document.addEventListener("click", (e) => { const a = e.target.closest("a[href^='#']"); if (a && a.getAttribute("href") === location.hash) { e.preventDefault(); route(); } });

/* ---------------- Home: the Station ---------------- */
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late shift";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Night shift";
}

async function home(el) {
  const r = rank(); const t = today(); const s = streak();
  const nclex = daysUntil(state.profile.nclexDate); const grad = daysUntil(state.profile.gradDate);
  const due = await dueCount();
  const photo = await idb.get("kv", "photo");
  const photoUrl = photo ? URL.createObjectURL(photo) : "";
  const goal = state.profile.dailyGoal || 60;
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  el.innerHTML = `
  <section class="hero wrap">
    <div class="hero-copy">
      <p class="eyebrow"><span class="dot"></span>${esc(dateStr)}${s ? ` · ${s}-day streak` : ""}</p>
      <h1 class="display">${greeting()},<br><span class="nurse">Nurse ${esc(CONFIG.lastName)}</span><span class="almost">(almost)</span><span class="sparkle" aria-hidden="true">✦</span><span class="sparkle s2" aria-hidden="true">✦</span></h1>
      <p class="lede">${esc(pick(AFFIRMATIONS))}</p>
      <div class="cta">
        <a class="btn primary" href="#/cards/due">Start today's rounds <span class="pill">${due} due</span></a>
        <a class="btn" href="#/games">Take a break-room game</a>
      </div>
    </div>
    <aside class="badge" aria-label="ID badge">
      <div class="badge-clip"></div>
      <div class="badge-top"><span>${esc(CONFIG.school)}</span><span>Student RN</span></div>
      <label class="badge-photo ${photoUrl ? "has" : ""}" title="Add your photo">
        ${photoUrl ? `<img src="${photoUrl}" alt="Sandra">` : `<span class="mono-initials">${esc(CONFIG.firstName[0] + CONFIG.lastName[0])}</span><span class="add">+ photo</span>`}
        <input type="file" accept="image/*" id="photoIn" hidden>
      </label>
      <div class="badge-name">${esc(CONFIG.firstName)} <b>${esc(CONFIG.lastName)}</b></div>
      <div class="badge-role">${esc(CONFIG.program)} candidate · ${esc(r.name)}</div>
      <div class="badge-bar" aria-hidden="true">${barcode(state.xp)}</div>
      <div class="badge-foot"><span>XP ${state.xp.toLocaleString()}</span><span>${r.next ? `${(r.next - state.xp).toLocaleString()} to ${esc(r.nextName)}` : "Top rank"}</span></div>
    </aside>
  </section>

  <section class="vitals wrap" aria-label="Today at a glance">
    <div class="vital big">
      <div class="label">NCLEX</div>
      ${nclex === null ? `<div class="vital-set"><p>When is your test date?</p><input type="date" id="nclexIn" aria-label="NCLEX date"><button class="btn sm" id="nclexSave">Set</button></div>`
        : nclex >= 0 ? `<div class="vital-num">${nclex}<small>days</small></div><p class="vital-sub">until test day · ${new Date(state.profile.nclexDate + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>`
        : `<div class="vital-num">RN<small>?</small></div><p class="vital-sub">Test day has passed. Tell me how it went.</p>`}
    </div>
    <div class="vital ringwrap">
      ${ring(t.xp / goal, 104, 10, "Daily goal")}
      <div class="ring-mid"><b>${t.xp}</b><span>/ ${goal} XP</span></div>
      <div><div class="label">Today's goal</div><p class="vital-sub">${t.xp >= goal ? "Goal met. Anything more is a bonus." : `${goal - t.xp} XP to go. A deck review is ~20.`}</p></div>
    </div>
    <div class="vital"><div class="label">Streak</div><div class="vital-num">${s}<small>${s === 1 ? "day" : "days"}</small></div><p class="vital-sub">${s ? "Keep the rhythm going." : "One review starts it."}</p></div>
    <div class="vital"><div class="label">${grad !== null && grad >= 0 ? "Graduation" : "Cards due"}</div>
      ${grad !== null && grad >= 0 ? `<div class="vital-num">${grad}<small>days</small></div><p class="vital-sub">until you walk</p>` : `<div class="vital-num">${due}<small>cards</small></div><p class="vital-sub"><a href="#/cards/due">Review now</a></p>`}</div>
  </section>

  <section class="rhythm wrap">
    <div class="sec-head"><span class="num">01</span><h2>Your study rhythm</h2><p>Every day you study puts a beat on the strip. Keep it out of flatline.</p></div>
    <div class="monitor">${rhythmStrip(21)}<div class="monitor-read"><span>HR</span><b>${Math.max(60, 60 + s * 4)}</b><span>bpm of pure focus</span></div></div>
  </section>

  <section class="rooms wrap">
    <div class="sec-head"><span class="num">02</span><h2>Where to today?</h2></div>
    <div class="room-grid">
      ${room("#/chart", "My Chart", "Upload lecture slides, PDFs and notes. They become cards, quizzes and games.", "chart", "A")}
      ${room("#/cards", "Flash Rounds", "Spaced-repetition flashcards. Your decks plus starter decks on isolation, antidotes and more.", "cards", "B")}
      ${room("#/practice", "Q-Bank", `${CATEGORIES.length} NCLEX client-needs areas. Multiple choice and select-all, with rationales.`, "q", "C")}
      ${room("#/games", "Break Room", "Lab Lightning, Who First?, Stem Snap, Dose Drill and Pair Rounds. Learning disguised as a break.", "games", "D")}
    </div>
  </section>

  ${CONFIG.note?.text ? `<section class="note wrap"><figure class="letter"><blockquote>${esc(CONFIG.note.text)}</blockquote><figcaption>— ${esc(CONFIG.note.from)}</figcaption><span class="tape"></span></figure></section>` : ""}
  `;

  $("#photoIn")?.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    await idb.put("kv", await shrinkImage(f, 600), "photo"); toast("Looking good, Nurse " + esc(CONFIG.lastName) + "."); home(el);
  });
  $("#nclexSave")?.addEventListener("click", () => {
    const v = $("#nclexIn").value; if (!v) return toast("Pick a date first.");
    state.profile.nclexDate = v; save(); toast("Countdown started. You've got this."); home(el);
  });
  if (!state.welcomed) welcome();
}

const room = (href, title, body, icon, letter) => `
  <a class="room" href="${href}"><span class="room-letter">${letter}</span><span class="room-ico">${ICONS[icon]}</span>
  <h3>${title}</h3><p>${body}</p><span class="room-go">Open →</span></a>`;

export const ICONS = {
  chart: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="10" y="6" width="28" height="36" rx="3"/><path d="M18 6v-1a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1M16 18h16M16 25h16M16 32h10"/></svg>`,
  cards: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="6" y="12" width="26" height="30" rx="3" transform="rotate(-8 19 27)"/><rect x="16" y="8" width="26" height="30" rx="3"/><path d="M29 18v10M24 23h10"/></svg>`,
  q: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="24" cy="24" r="18"/><path d="M18.5 19a5.5 5.5 0 1 1 7.7 5c-1.4.6-2.2 1.6-2.2 3.2V29"/><circle cx="24" cy="34.5" r="1.2" fill="currentColor"/></svg>`,
  games: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16h20a9 9 0 0 1 8.6 11.6l-2 6.6a5 5 0 0 1-8.6 1.7L29 32H19l-3 3.9a5 5 0 0 1-8.6-1.7l-2-6.6A9 9 0 0 1 14 16z"/><path d="M16 22v6M13 25h6"/><circle cx="31" cy="23" r="1.4" fill="currentColor"/><circle cx="35" cy="27" r="1.4" fill="currentColor"/></svg>`,
};

function barcode(seed) {
  let s = seed + 7, out = ""; for (let i = 0; i < 38; i++) { s = (s * 9301 + 49297) % 233280; const w = 1 + (s % 3); out += `<i style="width:${w}px;margin-right:${1 + (s % 2) * 2}px"></i>`; } return out;
}

function shrinkImage(file, max) {
  return new Promise((res) => {
    const img = new Image(); img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas");
      c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => res(b || file), "image/jpeg", .86);
    }; img.onerror = () => res(file); img.src = URL.createObjectURL(file);
  });
}

function welcome() {
  const d = document.createElement("dialog"); d.className = "modal welcome";
  d.innerHTML = `<div class="modal-body">
    <p class="eyebrow">For Sandra</p>
    <h2 class="display sm">Welcome to your <em>Station</em>.</h2>
    <p>This is your own study space for the last stretch of the BSN and the NCLEX. A quick tour:</p>
    <ol class="tour">
      <li><b>My Chart</b> takes your lecture slides, PDFs, Word docs and notes and turns them into flashcards and quizzes.</li>
      <li><b>Flash Rounds</b> schedules reviews so you see each card right before you'd forget it.</li>
      <li><b>Q-Bank</b> is NCLEX-style practice with rationales.</li>
      <li><b>Break Room</b> has games for when your brain needs a lighter shift.</li>
    </ol>
    <p class="small">Everything you upload stays in this browser on this device. Nothing is sent anywhere. Back it up from the Pinning Wall now and then.</p>
    <div class="row"><label>NCLEX date <input type="date" id="wNclex"></label><label>Graduation <input type="date" id="wGrad"></label></div>
    <button class="btn primary" id="wGo">Let's go</button></div>`;
  document.body.appendChild(d); d.showModal();
  $("#wGo", d).onclick = () => {
    state.profile.nclexDate = $("#wNclex", d).value || state.profile.nclexDate; state.profile.gradDate = $("#wGrad", d).value || state.profile.gradDate;
    state.welcomed = true; save(); d.close(); d.remove(); persist(); confetti(); route();
  };
}

/* ---------------- My Chart: uploads ---------------- */
const KIND_LABEL = { pdf: "PDF", docx: "Word", pptx: "Slides", text: "Notes", image: "Image", other: "File" };

async function chart(el, [id, sub]) {
  if (id) return id === "new" ? newNote(el) : sub === "cards" ? makeCards(el, id) : reader(el, id);
  const files = (await idb.all("files")).sort((a, b) => b.added - a.added);
  el.innerHTML = `
  <section class="page-head wrap">
    <p class="eyebrow"><span class="dot"></span>My Chart</p>
    <h1 class="display md">Your notes, <em>charted</em>.</h1>
    <p class="lede">Drop in lecture slides, PDFs, Word docs, notes or photos. The Station reads them and turns them into flashcards, quizzes and games, all inside your browser.</p>
  </section>
  <section class="wrap">
    <label class="drop" id="drop">
      <input type="file" id="fileIn" multiple accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*" hidden>
      <span class="drop-ico">${ICONS.chart}</span>
      <span class="drop-t">Drop files here or <u>browse</u></span>
      <span class="drop-s">PDF · PowerPoint (.pptx) · Word (.docx) · text · images</span>
    </label>
    <p class="center"><a class="btn ghost" href="#/chart/new">Or paste / type a note</a></p>
    <div id="progress"></div>
  </section>
  <section class="wrap">
    <div class="sec-head"><span class="num">${String(files.length).padStart(2, "0")}</span><h2>On file</h2></div>
    ${files.length ? `<ul class="files">${files.map(fileRow).join("")}</ul>` : `<div class="empty">Nothing on file yet. Your first upload earns a pin.</div>`}
  </section>`;

  const input = $("#fileIn"), drop = $("#drop");
  input.onchange = () => ingest([...input.files]);
  ["dragenter", "dragover"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (ev) => ingest([...ev.dataTransfer.files]));
  $$("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm("Delete this file? Cards you already made from it stay.")) return;
    await idb.del("files", b.dataset.del); chart(el, []);
  });

  async function ingest(list) {
    if (!list.length) return;
    persist();
    const prog = $("#progress");
    for (const f of list) {
      const row = document.createElement("div"); row.className = "ingest"; row.innerHTML = `<span class="spin"></span> Reading <b>${esc(f.name)}</b>…`; prog.appendChild(row);
      try {
        const kind = kindOf(f);
        const text = kind === "image" || kind === "other" ? "" : await extractText(f);
        const rec = { id: uid(), name: f.name, kind, size: f.size, added: Date.now(), blob: f, text };
        await idb.put("files", rec);
        row.innerHTML = `✓ <b>${esc(f.name)}</b>: ${text ? `${text.split(/\s+/).length.toLocaleString()} words read.` : kind === "image" ? "saved. Images can go on cards." : "saved."}`;
        award(15, "files"); pin("first-file");
      } catch (e) {
        console.error(e); row.innerHTML = `✗ Couldn't read <b>${esc(f.name)}</b>. ${esc(e.message || "")}`; row.classList.add("bad");
      }
    }
    setTimeout(() => chart(el, []), 900);
  }
}

const fileRow = (f) => `
  <li class="file">
    <span class="ftype t-${f.kind}">${KIND_LABEL[f.kind] || "File"}</span>
    <a class="fname" href="#/chart/${f.id}">${esc(f.name)}</a>
    <span class="fmeta">${fmtSize(f.size || 0)} · ${new Date(f.added).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${f.text ? ` · ${f.text.split(/\s+/).length.toLocaleString()} words` : ""}</span>
    <span class="factions">
      ${f.text ? `<a class="btn sm" href="#/chart/${f.id}/cards">Make cards</a>` : ""}
      <a class="btn sm ghost" href="#/chart/${f.id}">${f.kind === "image" ? "View" : "Read"}</a>
      <button class="btn sm ghost icon" data-del="${f.id}" aria-label="Delete ${esc(f.name)}">✕</button>
    </span>
  </li>`;

function newNote(el) {
  el.innerHTML = `<section class="page-head wrap">${back("#/chart", "My Chart")}<h1 class="display md">New <em>note</em></h1>
    <p class="lede">Paste class notes or type them out. Lines like <code>Term: definition</code> make the cleanest cards.</p></section>
    <section class="wrap narrow"><label class="field">Title<input id="nTitle" placeholder="e.g. Week 9 · Cardiac meds"></label>
    <label class="field">Notes<textarea id="nBody" rows="14" placeholder="Furosemide: loop diuretic, watch potassium&#10;Normal potassium is 3.5-5.0 mEq/L.&#10;..."></textarea></label>
    <button class="btn primary" id="nSave">Save to my chart</button></section>`;
  $("#nSave").onclick = async () => {
    const text = $("#nBody").value.trim(); if (!text) return toast("Add some notes first.");
    const name = ($("#nTitle").value.trim() || "Note " + new Date().toLocaleDateString()) ;
    const id = uid(); await idb.put("files", { id, name, kind: "text", size: text.length, added: Date.now(), text });
    award(15, "files"); pin("first-file"); location.hash = `#/chart/${id}/cards`;
  };
}

async function reader(el, id) {
  const f = await idb.get("files", id); if (!f) return (location.hash = "#/chart");
  if (f.kind === "image") {
    const url = URL.createObjectURL(f.blob);
    el.innerHTML = `<section class="page-head wrap">${back("#/chart", "My Chart")}<h1 class="display md">${esc(f.name)}</h1></section>
      <section class="wrap narrow"><img class="viewer-img" src="${url}" alt="${esc(f.name)}">
      <div class="card-form"><h3>Make an image card</h3><p class="small">The image goes on the front. Type what it shows on the back.</p>
      <label class="field">Answer<input id="imgBack" placeholder="e.g. Peaked T waves: hyperkalemia"></label>${deckPicker()}<button class="btn primary" id="imgAdd">Add card</button></div></section>`;
    await fillDeckPicker(f.name);
    $("#imgAdd").onclick = async () => {
      const backTxt = $("#imgBack").value.trim(); if (!backTxt) return toast("Type the answer first.");
      const deck = await resolveDeck(); await idb.put("cards", newCard(deck, "", backTxt, f.name, id)); toast("Card added."); $("#imgBack").value = "";
    };
    return;
  }
  el.innerHTML = `<section class="page-head wrap">${back("#/chart", "My Chart")}
    <p class="eyebrow"><span class="dot"></span>${KIND_LABEL[f.kind]} · ${f.text ? f.text.split(/\s+/).length.toLocaleString() + " words" : "no text found"}</p>
    <h1 class="display md">${esc(f.name.replace(/\.\w+$/, ""))}</h1>
    <div class="cta"><a class="btn primary" href="#/chart/${id}/cards">Make cards from this</a><a class="btn" href="#/practice?file=${id}">Quiz me on it</a></div>
    <p class="small hint">Tip: highlight any sentence below to turn it into a card.</p></section>
    <section class="wrap narrow"><article class="reading">${f.text ? f.text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") : `<p>No readable text in this file. If it's a scanned PDF, the words are pictures; try the original slides or a typed version.</p>`}</article></section>
    <button class="sel-pop" id="selPop" hidden>+ Make a card</button>`;
  const pop = $("#selPop");
  const onSel = () => {
    const s = getSelection(); const txt = s.toString().trim();
    if (!txt || !$(".reading").contains(s.anchorNode)) { pop.hidden = true; return; }
    const rc = s.getRangeAt(0).getBoundingClientRect(); pop.hidden = false;
    pop.style.top = scrollY + rc.top - 46 + "px"; pop.style.left = Math.max(12, Math.min(innerWidth - 170, rc.left + rc.width / 2 - 70)) + "px";
    pop.onclick = () => { pop.hidden = true; cardModal(txt, f, id); };
  };
  document.addEventListener("selectionchange", onSel);
  document.addEventListener("leave", () => document.removeEventListener("selectionchange", onSel), { once: true });
}

async function cardModal(sel, f, fileId) {
  const d = document.createElement("dialog"); d.className = "modal";
  d.innerHTML = `<form method="dialog" class="modal-body"><h3>New card</h3>
    <label class="field">Front (question)<textarea id="mF" rows="3" placeholder="What should this answer?"></textarea></label>
    <label class="field">Back (answer)<textarea id="mB" rows="4">${esc(sel)}</textarea></label>
    <button type="button" class="btn sm ghost" id="mCloze">Make it fill-in-the-blank instead</button>
    ${deckPicker()}
    <div class="row end"><button class="btn ghost" value="cancel">Cancel</button><button class="btn primary" id="mAdd" value="ok">Add card</button></div></form>`;
  document.body.appendChild(d); d.showModal(); await fillDeckPicker(f.name);
  $("#mCloze", d).onclick = () => {
    const w = prompt("Which word or phrase should be blanked out?"); if (!w) return;
    if (!sel.includes(w)) return toast("That phrase isn't in the selection.");
    $("#mF", d).value = sel.replace(w, "_____"); $("#mB", d).value = w;
  };
  $("#mAdd", d).onclick = async (e) => {
    e.preventDefault(); const fr = $("#mF", d).value.trim(), bk = $("#mB", d).value.trim();
    if (!fr || !bk) return toast("Both sides need something.");
    const deck = await resolveDeck(); await idb.put("cards", newCard(deck, fr, bk, f.name, fileId)); award(3); toast("Card added to your deck."); d.close(); d.remove();
  };
  d.addEventListener("close", () => d.remove());
}

async function makeCards(el, id) {
  const f = await idb.get("files", id); if (!f) return (location.hash = "#/chart");
  const gen = generateCards(f.text || "");
  el.innerHTML = `<section class="page-head wrap">${back("#/chart/" + id, "Back to the file")}
    <p class="eyebrow"><span class="dot"></span>From ${esc(f.name)}</p>
    <h1 class="display md">${gen.length ? `${gen.length} cards <em>found</em>.` : "No cards <em>found</em>."}</h1>
    <p class="lede">${gen.length ? "Untick anything that isn't useful and fix wording right in the boxes. Then pick a deck." : "This file didn't have clear definitions or facts to pull out. Open it and highlight sentences to make cards by hand."}</p></section>
    ${gen.length ? `<section class="wrap narrow">
      <div class="gen-tools"><button class="btn sm ghost" id="all">Select all</button><button class="btn sm ghost" id="none">Select none</button><span class="small" id="cnt"></span></div>
      <ol class="gen">${gen.map((c, i) => `<li class="gen-row"><input type="checkbox" checked data-i="${i}" aria-label="Keep card ${i + 1}">
        <div class="gen-fields"><span class="kind k-${c.kind}">${{ term: "Term", define: "Definition", cloze: "Fill-in" }[c.kind]}</span>
        <textarea data-f="${i}" rows="2">${esc(c.front)}</textarea><textarea data-b="${i}" rows="2">${esc(c.back)}</textarea></div></li>`).join("")}</ol>
      <div class="sticky-save card-form">${deckPicker()}<button class="btn primary" id="saveGen">Add cards</button></div></section>` : `<section class="wrap narrow"><a class="btn primary" href="#/chart/${id}">Open the file</a></section>`}`;
  if (!gen.length) return;
  await fillDeckPicker(f.name.replace(/\.\w+$/, ""));
  const upd = () => ($("#cnt").textContent = `${$$(".gen input:checked").length} of ${gen.length} selected`); upd();
  $$(".gen input").forEach((c) => (c.onchange = upd));
  $("#all").onclick = () => { $$(".gen input").forEach((c) => (c.checked = true)); upd(); };
  $("#none").onclick = () => { $$(".gen input").forEach((c) => (c.checked = false)); upd(); };
  $("#saveGen").onclick = async () => {
    const keep = $$(".gen input:checked").map((c) => +c.dataset.i); if (!keep.length) return toast("Select at least one card.");
    const deck = await resolveDeck();
    await idb.putMany("cards", keep.map((i) => newCard(deck, $(`[data-f="${i}"]`).value.trim(), $(`[data-b="${i}"]`).value.trim(), f.name, id, gen[i].kind)));
    award(10, "decks"); pin("deck-maker"); confetti(); toast(`${keep.length} cards added.`); location.hash = `#/cards`;
  };
}

function newCard(deck, front, backTxt, source, fileId, kind = "term") {
  return { id: uid(), deck, front, back: backTxt, kind, source, file: fileId, image: !front ? fileId : undefined, due: 0, ivl: 0, ease: 2.5, reps: 0 };
}
const deckPicker = () => `<label class="field">Deck<select id="deckSel"></select></label><label class="field" id="newDeckWrap">New deck name<input id="newDeck"></label>`;
async function fillDeckPicker(suggest) {
  const decks = (await idb.all("decks")).filter((d) => !d.builtin).sort((a, b) => b.created - a.created);
  const sel = $("#deckSel"); sel.innerHTML = `<option value="__new">+ New deck</option>` + decks.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
  $("#newDeck").value = suggest || "";
  const tog = () => ($("#newDeckWrap").hidden = sel.value !== "__new"); sel.onchange = tog; tog();
}
async function resolveDeck() {
  const v = $("#deckSel").value; if (v !== "__new") return v;
  const id = uid(); const colors = ["coral", "teal", "plum", "butter"];
  await idb.put("decks", { id, name: $("#newDeck").value.trim() || "My deck", color: pick(colors), created: Date.now() });
  $("#deckSel").insertAdjacentHTML("beforeend", `<option value="${id}">${esc($("#newDeck").value.trim() || "My deck")}</option>`); $("#deckSel").value = id; $("#newDeckWrap").hidden = true;
  return id;
}

/* ---------------- Pinning wall: progress, pins, settings ---------------- */
async function wall(el) {
  const r = rank(); const cats = CATEGORIES.map((name, i) => ({ name, ...(state.qstats[i] || { right: 0, total: 0 }) }));
  const totalDays = Object.values(state.days).filter((d) => d.xp > 0).length; const c = state.count || {};
  el.innerHTML = `
  <section class="page-head wrap"><p class="eyebrow"><span class="dot"></span>Pinning Wall</p>
    <h1 class="display md">${esc(r.name)}<em>.</em></h1>
    <div class="xpbar"><div style="width:${Math.round(r.pct * 100)}%"></div></div>
    <p class="lede">${state.xp.toLocaleString()} XP${r.next ? ` · ${(r.next - state.xp).toLocaleString()} more to <b>${esc(r.nextName)}</b>` : " · top of the ladder"}</p></section>

  <section class="wrap stats">
    ${stat(totalDays, "days studied")}${stat(streak(), "day streak")}${stat(c.cards || 0, "cards reviewed")}${stat(c.q || 0, "questions answered")}
  </section>

  <section class="wrap">
    <div class="sec-head"><span class="num">01</span><h2>Client-needs accuracy</h2><p>From Q-Bank. Aim for steady 70%+ across all eight.</p></div>
    <div class="bars">${cats.map((k, i) => { const p = k.total ? Math.round((k.right / k.total) * 100) : null; return `
      <a class="bar" href="#/practice?cat=${i}"><span class="bar-name">${esc(k.name)}</span><span class="bar-track"><span class="bar-fill ${p !== null && p < 60 ? "low" : ""}" style="width:${p ?? 0}%"></span></span><span class="bar-val">${p === null ? "—" : p + "%"}</span><span class="bar-n">${k.total ? k.total + " q" : "start"}</span></a>`; }).join("")}</div>
  </section>

  <section class="wrap">
    <div class="sec-head"><span class="num">02</span><h2>Pins</h2><p>${Object.keys(state.pins).length} of ${PINS.length} earned.</p></div>
    <div class="pins">${PINS.map((p) => `<div class="pinb ${state.pins[p.id] ? "got" : ""}"><span class="pin-g">${p.glyph}</span><b>${esc(p.name)}</b><span>${esc(p.desc)}</span>${state.pins[p.id] ? `<em>${new Date(state.pins[p.id]).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</em>` : ""}</div>`).join("")}</div>
  </section>

  <section class="wrap">
    <div class="sec-head"><span class="num">03</span><h2>Settings</h2></div>
    <div class="settings card-form">
      <label class="field">NCLEX date<input type="date" id="sN" value="${state.profile.nclexDate}"></label>
      <label class="field">Graduation date<input type="date" id="sG" value="${state.profile.gradDate}"></label>
      <label class="field">Daily XP goal<input type="number" id="sD" min="10" step="10" value="${state.profile.dailyGoal}"></label>
      <label class="check"><input type="checkbox" id="sS" ${state.sound ? "checked" : ""}> Monitor beeps on answers</label>
      <button class="btn primary" id="sSave">Save settings</button>
    </div>
  </section>

  <section class="wrap">
    <div class="sec-head"><span class="num">04</span><h2>Your data</h2><p>Everything lives in this browser on this device. Download a backup now and then, and use it to move to another device.</p></div>
    <div class="row"><button class="btn" id="bDown">Download backup</button><label class="btn ghost">Restore from backup<input type="file" id="bUp" accept=".json,application/json" hidden></label></div>
  </section>`;
  $("#sSave").onclick = () => {
    state.profile.nclexDate = $("#sN").value; state.profile.gradDate = $("#sG").value;
    state.profile.dailyGoal = Math.max(10, +$("#sD").value || 60); state.sound = $("#sS").checked; save(); toast("Saved."); beep(true);
  };
  $("#bDown").onclick = async () => {
    toast("Packing your backup…"); const data = await exportBackup();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = `sandra-station-backup-${todayKey()}.json`; a.click();
  };
  $("#bUp").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm("Restoring replaces everything currently on this device with the backup. Continue?")) return;
    try { await importBackup(JSON.parse(await f.text())); toast("Restored."); wall(el); } catch (err) { toast(esc(err.message)); }
  };
}
const stat = (n, l) => `<div class="stat"><b>${Number(n).toLocaleString()}</b><span>${l}</span></div>`;

/* ---------------- Boot ---------------- */
document.addEventListener("xp", () => { const r = rank(); const b = $("#hdrXp"); if (b) b.textContent = `${state.xp.toLocaleString()} XP · ${r.name}`; });
seed().then(route).then(() => document.dispatchEvent(new Event("xp")));
export { route, newCard };
export { intervalLabel };
