# Apollo Lead Tool — Build Spec (v1)

## v1 SCOPE (locked by user 2026-07-03) — exactly three things:
1. **Paste an Apollo search URL** → app decodes its filters into the editable
   filter form (fast pre-fill; user verifies/edits gaps like industry tag).
2. **Build filters manually** in the form (titles, location, size, industry,
   keywords, verified-only, exclusions).
3. **Run the session** (dry-run preview → capped enrich) → output **one clean,
   deduplicated, best-decision-maker CSV** to download.
Everything else below (MillionVerifier hookup, free-scrape mode, presets,
multi-user) is LATER, not v1.

---


**Goal:** production-quality **personal** app (portfolio-grade) that turns Apollo
searches into clean, deduplicated, best-decision-maker lead lists with verified
emails — safely (credit caps, dry-run, resume). Single-user, own API key.
Architected so it *could* go multi-user later IF Apollo ToS is cleared first.

**Not in scope (v1):** auth, billing, hosting, multi-tenant, browser-scraping
(that stays a separate tool). No cloud — runs on localhost.

---

## Stack

- **Backend:** Python + **FastAPI** (wraps the already-tested logic from
  `campaigns/atom-services/leads/apollo_paid_api/apollo_api_leads.py`).
- **Frontend:** **React (Vite)** single-page app, talks to the backend over HTTP.
- **Storage:** local files only — no database.
- **Runs at:** `http://localhost:8000` (API) + Vite dev server for UI in dev;
  in "prod" the backend serves the built React bundle so it's one process.

## Folder layout

```
apollo-app/
  backend/
    app.py              # FastAPI entry (routes)
    core/
      apollo.py         # search + enrich API calls (from existing script)
      picker.py         # best-decision-maker + dedupe logic
      filters.py        # filter model + Apollo-URL parser
      suppression.py    # exclude already-paid / already-contacted firms
      store.py          # read/write runs on disk
    settings.json       # API key, defaults (gitignored — secrets)
    requirements.txt
  frontend/
    (React + Vite app — the 5 screens)
  runs/
    <run-name>/
      leads.csv         # winners (one best per firm, emails after enrich)
      backup.csv        # spare partners
      run.json          # filters used, counts, credits spent, status
  SPEC.md               # this file
```

## Backend API (the contract)

| Method | Endpoint | Does | Spends credits? |
|---|---|---|---|
| POST | `/api/preview` | run search + picker on given filters; return counts + sample + est. cost | No |
| POST | `/api/enrich` | reveal emails for winners, capped; **streams** progress (SSE) | YES |
| GET  | `/api/runs` | list past runs | No |
| GET  | `/api/runs/{name}` | one run's data + stats | No |
| GET  | `/api/runs/{name}/export` | download leads.csv | No |
| POST | `/api/parse-url` | decode a pasted Apollo search URL into a filter object | No |
| GET/POST | `/api/settings` | read/save API key + defaults | No |

**Safety rules baked into the engine (from hard-won lessons):**
- `/api/enrich` requires an explicit `max_credits` and confirmed=true flag.
- Resume by `person_id`: never re-charge an already-revealed contact.
- Checkpoint to disk every 10 reveals; graceful stop saves partial.
- Enrich in seniority order so a cap lands on the least-certain titles.
- Re-matching an unlocked contact CHARGES AGAIN — engine must skip, never re-call.
- Master API key required; verified-email + industry-tag-id filters are mandatory
  defaults (industry "Accounting" = tag id `5567ce1f7369643b78570000`).

## Filter model (guided-filter UI + URL parser both produce this)

```
{
  person_titles: [str],  person_not_titles: [str],
  locations: [str],      employees_ranges: [str],   # e.g. "2,20"
  industry_tag_ids: [str], keywords: [str],
  email_status: ["verified"],
  seniority_order: [str],           # for the picker
  exclude_companies: [str]
}
```

## The 5 screens (React)

1. **New Search** — guided filter form (chips/dropdowns) OR paste Apollo URL.
2. **Preview** — "5,124 people → 3,591 firms → ~2,400 credits". Confirm gate.
3. **Run** — live progress bar, credit counter, streaming log, Stop button.
4. **Results** — table + quality stats (title mix, domain %, email-pattern
   breakdown) + Download CSV.
5. **History** — past runs, re-open, re-download.

## Build phases

- **Phase 1** — backend only: refactor existing script into `core/` modules +
  FastAPI routes; test via HTTP (no UI). Reuses ~70% tested code.
- **Phase 2** — React app: the 5 screens against the Phase-1 API.
- **Phase 3** — polish: Apollo-URL paste, presets, MillionVerifier hookup,
  free-scrape mode.
- **Phase 4** — (gated on ToS) multi-user.

## Security

- API key in `settings.json`, **gitignored**, never in code or frontend.
- Backend binds to `127.0.0.1` only (not exposed to network).
- No telemetry, no external calls except Apollo (+ later MillionVerifier).
```
