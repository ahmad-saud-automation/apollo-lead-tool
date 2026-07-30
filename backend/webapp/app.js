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
function download(url) { const a = document.createElement("a"); a.href = url; document.body.appendChild(a); a.click(); a.remove(); }

/* theme */
function applyTheme(t) { document.documentElement.dataset.theme = t; const b = $("#themeBtn"); if (b) b.textContent = t === "dark" ? "☀ Light" : "◐ Dark"; }
const themeParam = new URLSearchParams(location.search).get("theme");
applyTheme(themeParam === "light" || themeParam === "dark" ? themeParam : (localStorage.getItem("alt_theme") || "dark"));
$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("alt_theme", next); applyTheme(next);
});

/* sidebar */
function applyNav(c) { document.body.classList.toggle("nav-collapsed", !!c); localStorage.setItem("alt_nav", c ? "1" : "0"); }
applyNav(localStorage.getItem("alt_nav") === null ? window.innerWidth < 900 : localStorage.getItem("alt_nav") === "1");
$("#menuBtn").addEventListener("click", () => applyNav(!document.body.classList.contains("nav-collapsed")));
$("#scrim").addEventListener("click", () => applyNav(true));

/* pipeline bar, reflects how far this search has got */
const PIPE = [
  { n: 1, label: "search", tab: "search" },
  { n: 2, label: "preview", tab: "preview" },
  { n: 3, label: "reveal", tab: "run" },
  { n: 4, label: "results", tab: "results" },
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
const TABS = ["search", "preview", "run", "results", "history", "settings"];
function showTab(t) {
  $$(".navb").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  $$(".panel").forEach(p => (p.hidden = p.dataset.panel !== t));
  if (t === "history") loadHistory();
  if (t === "settings") loadSettings();
  if (t === "results") loadResults(currentRun || null);
  if (t === "preview" && !previewData) restoreLatestPreview();
  const at = PIPE.findIndex(p => p.tab === t);      // keep the top bar on the step you're viewing
  if (at > -1) { stage = at; renderPipeline(); }
  if (window.innerWidth < 900) applyNav(true);
}
$("#nav").addEventListener("click", e => { const b = e.target.closest(".navb"); if (b) location.hash = b.dataset.tab; });
window.addEventListener("hashchange", () => { const h = (location.hash || "").replace("#", ""); showTab(TABS.includes(h) ? h : "search"); });

/* 1 · New search */
$("#srcSeg").addEventListener("click", e => {
  const b = e.target.closest(".seg-b"); if (!b) return;
  $$("#srcSeg .seg-b").forEach(x => x.classList.toggle("active", x === b));
  const url = b.dataset.src === "url";
  $("#urlBlock").hidden = !url;
  $("#filterBlock").hidden = url;
});
function readFilters() {
  return {
    person_titles: csv($("#fTitles").value),
    person_not_titles: csv($("#fNotTitles").value),
    locations: csv($("#fLocations").value),
    employees_ranges: csv($("#fEmployees").value),
    keywords: csv($("#fKeywords").value),
    exclude_companies: csv($("#fExclude").value),
    email_status: $("#fVerified").checked ? ["verified"] : [],
  };
}
function writeFilters(f) {
  $("#fTitles").value = (f.person_titles || []).join(", ");
  $("#fNotTitles").value = (f.person_not_titles || []).join(", ");
  $("#fLocations").value = (f.locations || []).join(", ");
  $("#fEmployees").value = (f.employees_ranges || []).join(", ");
  $("#fKeywords").value = (f.keywords || []).join(", ");
  $("#fExclude").value = (f.exclude_companies || []).join(", ");
  $("#fVerified").checked = (f.email_status || []).includes("verified");
}
$("#parseBtn").addEventListener("click", async () => {
  const url = $("#apolloUrl").value.trim();
  if (!url) { $("#parseMsg").textContent = "Paste a URL first."; return; }
  $("#parseMsg").textContent = "Reading...";
  try {
    const r = await post("/api/parse-url", { url });
    writeFilters(r.filters || {});
    $$("#srcSeg .seg-b").forEach(x => x.classList.toggle("active", x.dataset.src === "filters"));
    $("#urlBlock").hidden = true; $("#filterBlock").hidden = false;
    $("#parseMsg").textContent = "Filters loaded" + ((r.warnings || []).length ? ", with notes" : "");
    if ((r.warnings || []).length) $("#searchMsg").textContent = r.warnings.join(" · ");
  } catch (e) { $("#parseMsg").textContent = String(e.message || e); }
});
$("#previewBtn").addEventListener("click", async () => {
  const name = $("#runName").value.trim();
  if (!name) { $("#searchMsg").textContent = "Give the run a name first."; return; }
  $("#searchMsg").textContent = "Searching Apollo, this is free and can take a moment...";
  const body = { name, max_pages: Number($("#fMaxPages").value) || 60 };
  const sup = $("#fSuppression").value.trim(); if (sup) body.suppression_path = sup;
  if (!$("#urlBlock").hidden && $("#apolloUrl").value.trim()) body.apollo_url = $("#apolloUrl").value.trim();
  else body.filters = readFilters();
  try {
    previewData = await post("/api/preview", body);
    currentRun = name;
    $("#searchMsg").textContent = "";
    stage = 1; renderPipeline();
    renderPreview(previewData);
    location.hash = "preview";
  } catch (e) { $("#searchMsg").textContent = String(e.message || e); }
});

/* 2 · Preview */
function renderPreview(d) {
  $("#previewStats").innerHTML = [
    ["People matched", (d.people || 0).toLocaleString()],
    ["Firms after dedupe", (d.firms || 0).toLocaleString(), "good"],
    ["Already had", (d.suppressed || 0).toLocaleString()],
    ["Credits if you reveal all", (d.est_cost || 0).toLocaleString(), "warn"],
  ].map(t => tile(t[0], t[1], t[2])).join("");
  const steps = [
    { label: "People", value: d.people || 0 },
    { label: "Firms", value: d.firms_before_suppression || 0 },
    { label: "After suppression", value: d.firms || 0 },
  ];
  const max = Math.max(1, ...steps.map(s => s.value));
  $("#funnel").innerHTML = steps.map((s, i) =>
    `<div class="frow${i === steps.length - 1 ? " final" : ""}"><span class="flabel">${s.label}</span>
      <span class="ftrack"><span class="fbar" style="width:${Math.round(s.value / max * 100)}%"></span></span>
      <span class="fval">${s.value.toLocaleString()}</span></div>`).join("");
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
  $("#maxCredits").value = Math.min(50, d.est_cost || 50);
}

/* 3 · Run, streamed from the server */
$("#startRunBtn").addEventListener("click", async () => {
  if (!$("#confirmSpend").checked) { $("#previewMsg").textContent = "Tick the confirm box first."; return; }
  if (!currentRun) { $("#previewMsg").textContent = "Preview a search first."; return; }
  $("#previewMsg").textContent = "";
  stage = 2; renderPipeline();
  location.hash = "run";
  startRun(currentRun, Number($("#maxCredits").value) || 1);
});
$("#stopBtn").addEventListener("click", () => { if (runAbort) runAbort.abort(); });

async function startRun(name, cap) {
  const feed = $("#feed"); feed.innerHTML = "";
  let spent = 0, found = 0, missed = 0;
  const total = Math.min(cap, (previewData && previewData.est_cost) || cap);
  $("#stopBtn").hidden = false;
  $("#runMeta").textContent = `revealing up to ${cap} emails`;
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
      body: JSON.stringify({ name, max_credits: cap, confirmed: true }),
      signal: runAbort.signal,
    });
    if (!res.ok) { line("no", "✗", await res.text()); $("#stopBtn").hidden = true; return; }
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
        if (e.type === "email") { spent = e.n; found++; line("ok", "✓", `${e.company} · ${e.name} · ${e.email} (${e.status})`); }
        else if (e.type === "miss") { missed++; line("hd", "○", `${e.name} · no email available`); }
        else if (e.type === "error") { line("no", "✗", `${e.who} · ${e.msg}`); }
        else if (e.type === "capped") { line("sk", "▲", `stopped at the ${e.cap} credit cap`); }
        else if (e.type === "done") {
          line("ok", "■", `finished. ${e.emails} emails across ${e.firms} firms, ${e.credits_spent} credits spent`);
          $("#runMeta").textContent = `finished, ${e.credits_spent} credits spent`;
          stage = 3; renderPipeline(); loadResults(name);
        }
        paint();
      }
    }
  } catch (e) {
    line(e.name === "AbortError" ? "sk" : "no", e.name === "AbortError" ? "▲" : "✗",
         e.name === "AbortError" ? "stopped by you, progress was saved" : String(e.message || e));
    if (currentRun) loadResults(currentRun);
  }
  $("#stopBtn").hidden = true;
}

/* pick the newest run when a tab is opened cold, so nothing shows a blank page */
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
    renderPreview({
      people: run.people, firms: run.firms, suppressed: run.suppressed,
      firms_before_suppression: run.firms_before_suppression,
      est_cost: run.firms, warnings: run.warnings || [],
      sample: (run.rows || []).slice(0, 10),
    });
  } catch { }
}

/* 4 · Results */
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

/* 5 · History */
async function loadHistory() {
  let runs = []; try { runs = await api("/api/runs"); } catch { }
  const tb = $("#historyTable tbody"); tb.innerHTML = "";
  (runs || []).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(r.name)}</td><td>${esc(r.status || "")}</td>
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
  stage = 3; renderPipeline();
  location.hash = "results";
});

/* settings */
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
  await checkKey();
  const h = (location.hash || "").replace("#", "");
  showTab(TABS.includes(h) ? h : "search");
})();
