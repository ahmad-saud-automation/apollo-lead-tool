"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
let currentRun = "";
let previewData = null;
let runAbort = null;

async function api(p, o) {
  const r = await fetch(p, Object.assign({ headers: { "Content-Type": "application/json" } }, o));
  const ct = r.headers.get("content-type") || "";
  const body = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((body && body.detail) || body || ("HTTP " + r.status));
  return body;
}
const post = (p, b) => api(p, { method: "POST", body: JSON.stringify(b || {}) });
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const tile = (label, val, cls) => `<div class="stat"><span>${label}</span><b class="${cls || ""}">${val}</b></div>`;
const csv = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const num = n => (n == null ? "-" : Number(n).toLocaleString());
function download(url) { const a = document.createElement("a"); a.href = url; document.body.appendChild(a); a.click(); a.remove(); }

/* theme */
function applyTheme(t) { document.documentElement.dataset.theme = t; const b = $("#themeBtn"); if (b) b.textContent = t === "dark" ? "☀ Light" : "◐ Dark"; }
const themeParam = new URLSearchParams(location.search).get("theme");
applyTheme(themeParam === "light" || themeParam === "dark" ? themeParam : (localStorage.getItem("ae_theme") || "light"));
$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("ae_theme", next); applyTheme(next);
});

/* sidebar */
function applyNav(c) { document.body.classList.toggle("nav-collapsed", !!c); localStorage.setItem("ae_nav", c ? "1" : "0"); }
applyNav(localStorage.getItem("ae_nav") === null ? window.innerWidth < 900 : localStorage.getItem("ae_nav") === "1");
$("#menuBtn").addEventListener("click", () => applyNav(!document.body.classList.contains("nav-collapsed")));
$("#scrim").addEventListener("click", () => applyNav(true));

/* pipeline */
const PIPE = [
  { n: 1, label: "filter and count", tab: "search" },
  { n: 2, label: "reveal", tab: "run" },
  { n: 3, label: "results", tab: "results" },
];
let stage = 0;
function renderPipeline() {
  $("#pipeline").innerHTML = PIPE.map((p, i) => {
    const cls = i < stage ? "done" : (i === stage ? "now" : "");
    return `<button class="pstep ${cls}" data-tab="${p.tab}"><span class="pnum">${p.n}</span>${p.label}</button>`
      + (i < PIPE.length - 1 ? '<span class="pipe-sep">›</span>' : "");
  }).join("");
}
$("#pipeline").addEventListener("click", e => { const b = e.target.closest(".pstep"); if (b) location.hash = b.dataset.tab; });

/* tabs */
const TABS = ["search", "run", "results", "history", "settings"];
function showTab(t) {
  $$(".navb").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  $$(".panel").forEach(p => (p.hidden = p.dataset.panel !== t));
  if (t === "history") loadHistory();
  if (t === "settings") loadSettings();
  if (t === "results") loadResults(currentRun || null);
  if (t === "run" && !runAbort) replayLastRun();
  if (t === "search" && !previewData) restoreLatestPreview();
  const at = PIPE.findIndex(p => p.tab === t);
  if (at > -1) { stage = at; renderPipeline(); }
  if (window.innerWidth < 900) applyNav(true);
}
$("#nav").addEventListener("click", e => { const b = e.target.closest(".navb"); if (b) location.hash = b.dataset.tab; });
window.addEventListener("hashchange", () => { const h = (location.hash || "").replace("#", ""); showTab(TABS.includes(h) ? h : "search"); });

/* ---------- filters ---------- */
/* Headcount is special: Apollo wants a range as one string, "2,20". So that field
   splits on semicolons ("2,20; 21,50") while everything else splits on commas. */
const RANGE_SEP = s => String(s || "").split(";").map(x => x.trim()).filter(Boolean);
const FIELDS = [
  ["fTitles", "person_titles", "Title", csv],
  ["fNotTitles", "person_not_titles", "Not title", csv],
  ["fLocations", "locations", "Location", csv],
  ["fEmployees", "employees_ranges", "Headcount", RANGE_SEP],
  ["fKeywords", "keywords", "Keyword", csv],
  ["fExclude", "exclude_companies", "Excluded", csv],
];
const joinFor = (id, arr) => (id === "fEmployees" ? (arr || []).join("; ") : (arr || []).join(", "));

function readFilters() {
  const f = {};
  FIELDS.forEach(([id, key, , split]) => { f[key] = split($("#" + id).value); });
  f.email_status = $("#fVerified").checked ? ["verified"] : [];
  return f;
}
function writeFilters(f) {
  FIELDS.forEach(([id, key]) => { $("#" + id).value = joinFor(id, f[key]); });
  $("#fVerified").checked = (f.email_status || []).includes("verified");
  renderChips();
}
/* active filters shown as removable chips, the way Apollo does it */
function renderChips() {
  const bits = [];
  FIELDS.forEach(([id, key, label, split]) => {
    split($("#" + id).value).forEach(v => bits.push({ id, label, v }));
  });
  targetTitles().forEach(v => bits.push({ id: "fTargetTitles", label: "Role", v }));
  if ($("#fVerified").checked) bits.push({ id: "fVerified", label: "Email", v: "verified only" });
  if ($("#fSkipRevealed").checked) bits.push({ id: "fSkipRevealed", label: "Skip", v: "already paid for" });
  $("#activeChips").innerHTML = bits.map(b =>
    `<span class="fchip"><b>${esc(b.label)}</b> ${esc(b.v)}<button data-id="${b.id}" data-v="${esc(b.v)}" title="Remove">×</button></span>`
  ).join("");
}
$("#activeChips").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const el = $("#" + b.dataset.id);
  if (el.type === "checkbox") { el.checked = false; }
  else {
    const spec = FIELDS.find(f => f[0] === b.dataset.id);
    const split = spec ? spec[3] : csv;
    el.value = joinFor(b.dataset.id, split(el.value).filter(x => x !== b.dataset.v));
  }
  renderChips();
});
FIELDS.forEach(([id]) => $("#" + id).addEventListener("input", renderChips));
$("#fVerified").addEventListener("change", renderChips);
$("#fSkipRevealed").addEventListener("change", renderChips);

/* rail source tabs: build filters here, or paste an Apollo URL */
$("#sourceSeg").addEventListener("click", e => {
  const b = e.target.closest(".seg-b"); if (!b) return;
  $$("#sourceSeg .seg-b").forEach(x => x.classList.toggle("active", x === b));
  const url = b.dataset.src === "url";
  $("#srcUrl").hidden = !url;
  $("#srcBuild").hidden = url;
});

/* best available contact, or one specific role */
$("#roleModeSeg").addEventListener("click", e => {
  const b = e.target.closest(".seg-b"); if (!b) return;
  $$("#roleModeSeg .seg-b").forEach(x => x.classList.toggle("active", x === b));
  const specific = b.dataset.mode === "specific";
  $("#roleSpecific").hidden = !specific;
  $("#roleHelp").textContent = specific
    ? "Only people whose title matches what you type below. Use this when you want one job function, not just whoever is most senior."
    : "Picks the most senior person at each firm, owner first, then founder, managing partner, director and so on.";
  renderChips();
});
const roleMode = () => ($("#roleModeSeg .seg-b.active") || {}).dataset?.mode || "best";
const targetTitles = () => (roleMode() === "specific" ? csv($("#fTargetTitles").value) : []);
$("#fTargetTitles").addEventListener("input", renderChips);

$("#parseBtn").addEventListener("click", async () => {
  const url = $("#apolloUrl").value.trim();
  if (!url) { $("#parseMsg").textContent = "Paste a URL first."; return; }
  $("#parseMsg").textContent = "Reading...";
  try {
    const r = await post("/api/parse-url", { url });
    writeFilters(r.filters || {});
    $("#parseMsg").textContent = "Filters loaded" + ((r.warnings || []).length ? ", with notes" : "");
    if ((r.warnings || []).length) $("#searchMsg").textContent = r.warnings.join(" · ");
  } catch (e) { $("#parseMsg").textContent = String(e.message || e); }
});

$("#previewBtn").addEventListener("click", async () => {
  const name = $("#runName").value.trim();
  if (!name) { $("#searchMsg").textContent = "Give the run a name first."; return; }
  $("#searchMsg").textContent = "Counting. This is free and can take a moment.";
  $("#countLine").textContent = "counting...";
  const body = {
    name, max_pages: Number($("#fMaxPages").value) || 60,
    target_titles: targetTitles(),
    strict_roles: $("#fStrictRoles").checked,
    skip_revealed: $("#fSkipRevealed").checked,
  };
  const sup = $("#fSuppression").value.trim(); if (sup) body.suppression_path = sup;
  const usingUrl = !$("#srcUrl").hidden && $("#apolloUrl").value.trim();
  if (usingUrl) body.apollo_url = $("#apolloUrl").value.trim(); else body.filters = readFilters();
  try {
    previewData = await post("/api/preview", body);
    currentRun = name;
    $("#searchMsg").textContent = "";
    renderPreview(previewData);
  } catch (e) {
    $("#searchMsg").textContent = String(e.message || e);
    $("#countLine").textContent = "count failed";
  }
});

function renderPreview(d) {
  $("#countLine").innerHTML = `<b>${num(d.people)}</b> people &nbsp;›&nbsp; <b>${num(d.firms)}</b> firms &nbsp;›&nbsp; <b>${num(d.est_cost)}</b> credits`;
  $("#previewStats").innerHTML = [
    ["People matched", num(d.people)],
    ["Firms after dedupe", num(d.firms), "good"],
    ["Already paid for", num(d.already_revealed || 0)],
    ["On my do not contact", num(d.suppressed)],
    ["Credits to reveal all", num(d.est_cost), "warn"],
  ].map(t => tile(t[0], t[1], t[2])).join("");
  const steps = [
    { label: "People", value: d.people || 0 },
    { label: "One per firm", value: d.firms_before_suppression || 0 },
    { label: "New to me", value: d.firms || 0 },
  ];
  const max = Math.max(1, ...steps.map(s => s.value));
  $("#funnel").innerHTML = steps.map((s, i) =>
    `<div class="frow${i === steps.length - 1 ? " final" : ""}"><span class="flabel">${s.label}</span>
      <span class="ftrack"><span class="fbar" style="width:${Math.round(s.value / max * 100)}%"></span></span>
      <span class="fval">${num(s.value)}</span></div>`).join("");
  $("#previewFunnel").hidden = false;
  $("#previewWarn").innerHTML = (d.warnings || []).length
    ? `<div class="simbanner"><b>Worth knowing.</b> ${d.warnings.map(esc).join(" ")}</div>` : "";
  const tb = $("#sampleTable tbody"); tb.innerHTML = "";
  (d.sample || []).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(r.company_name)}</td><td>${esc(r.director_name)}</td>
      <td>${esc(r.title)}</td><td>${esc(r.domain) || "-"}</td>`;
    tb.appendChild(tr);
  });
  if (!tb.children.length) tb.innerHTML = '<tr><td colspan="4" class="muted">Nothing matched those filters.</td></tr>';
  $("#spendCard").hidden = !(d.est_cost > 0);
  $("#maxCredits").value = Math.min(50, d.est_cost || 50);
}

/* fall back to the newest run so nothing opens blank */
async function latestRunName(preferStatus) {
  try {
    const runs = await api("/api/runs");
    if (!runs || !runs.length) return null;
    const pref = preferStatus ? runs.filter(r => r.status === preferStatus) : [];
    return (pref[0] || runs[runs.length - 1]).name;
  } catch { return null; }
}
async function restoreLatestPreview() {
  const name = await latestRunName("previewed") || await latestRunName();
  if (!name) return;
  try {
    const run = await api("/api/runs/" + encodeURIComponent(name));
    currentRun = name;
    if (run.filters) writeFilters(run.filters);
    $("#runName").value = name;
    renderPreview({
      people: run.people, firms: run.firms, suppressed: run.suppressed,
      firms_before_suppression: run.firms_before_suppression,
      est_cost: run.firms, warnings: run.warnings || [],
      sample: (run.rows || []).slice(0, 10),
    });
  } catch { }
}

/* ---------- reveal ---------- */
$("#startRunBtn").addEventListener("click", async () => {
  if (!$("#confirmSpend").checked) { $("#previewMsg").textContent = "Tick the confirm box first."; return; }
  if (!currentRun) { $("#previewMsg").textContent = "Count a search first."; return; }
  $("#previewMsg").textContent = "";
  location.hash = "run";
  startRun(currentRun, Number($("#maxCredits").value) || 1);
});

/* test mode: simulate the reveal so the live feed can be watched for free */
const testMode = () => $("#testMode").checked;
function syncTestMode() {
  const t = testMode();
  $("#confirmHelper").textContent = t
    ? "Test mode is on, so this run is simulated and nothing will be charged."
    : "Test mode is off. This will call Apollo and spend real credits, up to the cap above.";
  $("#startRunBtn").textContent = t ? "Reveal emails (simulated)" : "Reveal emails";
}
$("#testMode").addEventListener("change", syncTestMode);
$("#stopBtn").addEventListener("click", () => { if (runAbort) runAbort.abort(); });

async function startRun(name, cap) {
  const feed = $("#feed"); feed.innerHTML = "";
  let spent = 0, found = 0, missed = 0;
  const total = Math.min(cap, (previewData && previewData.est_cost) || cap);
  const sim = testMode();
  $("#simBanner").hidden = !sim;
  $("#stopBtn").hidden = false;
  $("#runMeta").textContent = `revealing up to ${cap} emails` + (sim ? ", simulated" : "");
  const paint = () => {
    $("#runStats").innerHTML = [
      ["Credits spent", spent, "warn"], ["Emails found", found, "good"],
      ["No email", missed], ["Cap", cap],
    ].map(t => tile(t[0], t[1], t[2])).join("");
    $("#bar").style.width = Math.round(Math.min(1, spent / Math.max(1, total)) * 100) + "%";
  };
  paint();
  const line = (cls, icon, text) => {
    const d = document.createElement("div"); d.className = "ev";
    d.innerHTML = `<span class="${cls}">${icon}</span> ${esc(text)}`;
    feed.appendChild(d); feed.scrollTop = feed.scrollHeight;
  };

  runAbort = new AbortController();
  try {
    const res = await fetch("/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, max_credits: cap, confirmed: true, test_mode: sim }),
      signal: runAbort.signal,
    });
    if (!res.ok) { line("no", "x", await res.text()); $("#stopBtn").hidden = true; return; }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n"); buf = parts.pop();
      for (const p of parts) {
        const m = p.match(/^data: (.*)$/m); if (!m) continue;
        let e; try { e = JSON.parse(m[1]); } catch { continue; }
        if (e.type === "reused") { line("sk", "↺", `${e.n} contacts reused from earlier runs, no credits spent on those`); }
        else if (e.type === "email") { spent = e.n; found++; line("ok", "✓", `${e.company} · ${e.name} · ${e.email} (${e.status})`); }
        else if (e.type === "miss") { missed++; line("hd", "○", `${e.name} · no email available`); }
        else if (e.type === "error") { line("no", "x", `${e.who} · ${e.msg}`); }
        else if (e.type === "capped") { line("sk", "▲", `stopped at the ${e.cap} credit cap`); }
        else if (e.type === "done") {
          line("ok", "■", `finished. ${e.emails} emails across ${e.firms} firms, ${e.credits_spent} credits spent`);
          $("#runMeta").textContent = `finished, ${e.credits_spent} credits spent`;
          stage = 2; renderPipeline(); loadResults(name);
        }
        paint();
      }
    }
  } catch (e) {
    const stopped = e.name === "AbortError";
    line(stopped ? "sk" : "no", stopped ? "▲" : "x",
         stopped ? "stopped by you, progress was saved" : String(e.message || e));
    if (currentRun) loadResults(currentRun);
  }
  $("#stopBtn").hidden = true;
}

/* Coming back to the Reveal tab shouldn't show an empty box. Rebuild the log of
   the last run from what was saved, so the record survives navigating away. */
async function replayLastRun() {
  const feed = $("#feed");
  if (feed.querySelector(".ev")) return;                 // a live run already filled it
  const name = currentRun || await latestRunName("done") || await latestRunName();
  if (!name) return;
  let run; try { run = await api("/api/runs/" + encodeURIComponent(name)); } catch { return; }
  const rows = run.rows || [];
  const got = rows.filter(r => r.email && !String(r.email).includes("not_unlocked"));
  if (!got.length) return;
  currentRun = name;
  $("#simBanner").hidden = !run.test_mode;
  $("#runMeta").textContent = `${name}, finished, ${run.credits_spent || 0} credits spent`;
  $("#bar").style.width = "100%";
  $("#runStats").innerHTML = [
    ["Credits spent", run.credits_spent || 0, "warn"], ["Emails found", got.length, "good"],
    ["No email", rows.length - got.length], ["Firms", rows.length],
  ].map(t => tile(t[0], t[1], t[2])).join("");
  feed.innerHTML = "";
  got.slice(0, 60).forEach((r, i) => {
    const d = document.createElement("div"); d.className = "ev";
    d.innerHTML = `<span class="ok">✓</span> ${esc(r.company_name)} · ${esc(r.director_name)} · ${esc(r.email)} (${esc(r.email_status || "")})`;
    feed.appendChild(d);
  });
  const tail = document.createElement("div"); tail.className = "ev";
  tail.innerHTML = `<span class="ok">■</span> finished. ${got.length} emails across ${rows.length} firms, ${run.credits_spent || 0} credits spent`;
  feed.appendChild(tail);
}

/* ---------- results ---------- */
async function loadResults(name) {
  if (!name) name = await latestRunName("done") || await latestRunName();
  if (!name) return;
  let run; try { run = await api("/api/runs/" + encodeURIComponent(name)); } catch { return; }
  const rows = run.rows || [];
  const withEmail = rows.filter(r => r.email && !String(r.email).includes("not_unlocked"));
  $("#resultsCount").textContent = `${withEmail.length} emails across ${rows.length} firms`;
  $("#resultStats").innerHTML = [
    ["Firms", rows.length], ["Emails", withEmail.length, "good"],
    ["Credits spent", run.credits_spent || 0, "warn"],
    ["Hit rate", rows.length ? Math.round(withEmail.length / rows.length * 100) + "%" : "-"],
  ].map(t => tile(t[0], t[1], t[2])).join("");
  const mix = {};
  rows.forEach(r => { const t = (r.title || "unknown").toLowerCase().split(/[,/]/)[0].trim(); mix[t] = (mix[t] || 0) + 1; });
  const top = Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 8);
  $("#titleMix").innerHTML = top.map(([t, n]) => `<span class="chip">${esc(t)} · ${n}</span>`).join("");
  $("#qualityCard").hidden = !top.length;
  const tb = $("#resultsTable tbody"); tb.innerHTML = "";
  rows.slice(0, 100).forEach(r => {
    const has = r.email && !String(r.email).includes("not_unlocked");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(r.company_name)}</td><td>${esc(r.director_name)}</td><td>${esc(r.title)}</td>
      <td>${has ? esc(r.email) : '<span class="muted">not revealed</span>'}</td>
      <td class="${has ? "good" : ""}">${esc(r.email_status || "")}</td>`;
    tb.appendChild(tr);
  });
  currentRun = name;
}
$("#downloadBtn").addEventListener("click", () => {
  if (currentRun) download("/api/runs/" + encodeURIComponent(currentRun) + "/export");
});

/* ---------- history ---------- */
async function loadHistory() {
  let runs = []; try { runs = await api("/api/runs"); } catch { }
  const tb = $("#historyTable tbody"); tb.innerHTML = "";
  (runs || []).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(r.name)}</td><td><span class="pill">${esc(r.status || "")}</span></td>
      <td>${r.firms ?? ""}</td><td class="good">${r.emails ?? 0}</td><td>${r.credits_spent ?? 0}</td>
      <td><a class="dl" data-open="${esc(r.name)}">open</a> · <a class="dl" data-dl="${esc(r.name)}">csv</a></td>`;
    tb.appendChild(tr);
  });
  if (!tb.children.length) tb.innerHTML = '<tr><td colspan="6" class="muted">No runs yet.</td></tr>';
}
$("#historyTable").addEventListener("click", async e => {
  const a = e.target.closest("a.dl"); if (!a) return;
  if (a.dataset.dl) return download("/api/runs/" + encodeURIComponent(a.dataset.dl) + "/export");
  await loadResults(a.dataset.open);
  location.hash = "results";
});

/* ---------- settings ---------- */
async function loadSettings() {
  try {
    const s = await api("/api/settings");
    $("#apolloKey").value = "";
    $("#apolloKey").placeholder = s.apollo_api_key ? "key saved, leave blank to keep" : "paste key";
  } catch { }
}
$("#saveKeyBtn").addEventListener("click", async () => {
  const k = $("#apolloKey").value.trim();
  if (!k) { $("#settingsMsg").textContent = "Nothing to save."; return; }
  try { await post("/api/settings", { apollo_api_key: k }); $("#settingsMsg").textContent = "Saved"; checkKey(); }
  catch (e) { $("#settingsMsg").textContent = String(e.message || e); }
  setTimeout(() => ($("#settingsMsg").textContent = ""), 2000);
});
async function checkKey() {
  try {
    const s = await api("/api/settings");
    $("#keyState").textContent = s.apollo_api_key ? "Apollo key set" : "no Apollo key yet";
  } catch { $("#keyState").textContent = "backend not reachable"; }
}

/* boot */
(async function () {
  renderPipeline();
  renderChips();
  syncTestMode();
  await checkKey();
  const h = (location.hash || "").replace("#", "");
  showTab(TABS.includes(h) ? h : "search");
})();
