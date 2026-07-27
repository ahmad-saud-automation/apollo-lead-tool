# Apollo Lead Tool

**Every Apollo credit buys a real, unique decision-maker — never a duplicate, never someone you already have.**

## The problem this solves

On Apollo, you pay a credit each time you reveal a verified email. The money leaks in two places:

- **Duplicate firms.** One accountancy firm often shows up as three or four
  people — the owner, a partner, an office manager. Export the raw list and you
  pay a credit for *each* of them, even though you only need to reach **one**
  person at that firm.
- **People you already have.** Re-run a search next month and you pay again for
  firms already sitting in your CRM.

A real example: from **2,500 credits** you export **1,500 genuine firms** and
**1,000 duplicates** — different contacts at firms you already counted. That's
**1,000 credits gone** for zero new firms.

## How it saves the money

Before spending a single credit, the tool does two things:

1. **One decision-maker per firm.** It groups every result by company (even when
   the name is written slightly differently — "Smith & Co Ltd" and "Smith and
   Company" are treated as the same firm) and keeps only the **most senior**
   contact — owner first, then founder, managing partner, director, and so on.
   The rest are kept as free backups, not charged.
2. **Skips firms you already own.** Point it at your existing leads and it
   removes those firms up front, so you never pay twice for the same company.

In the example above, those 1,000 duplicate credits are simply never spent —
they stay in your account for **1,000 more real firms**. Same budget, more
genuine decision-makers, nothing wasted.

## You always see the cost before you spend

- **Free preview** — enter your search and it shows how many real firms you'll
  get and exactly how many credits it will cost, with a 10-row sample, *before*
  anything is charged.
- **Hard credit cap** — set a maximum; it never goes over, and spends on your
  most senior contacts first.
- **Safe to stop and resume** — if a run is interrupted, restarting it never
  re-charges a contact you already revealed.

---

## For developers

Production-quality personal app: Apollo search → best-decision-maker per firm →
verified emails, with credit caps / dry-run / resume. See `SPEC.md` for the full
design.

### Status
- **Phase 1 — backend engine (DONE):** FastAPI service wrapping the tested
  search / pick / enrich / suppression logic. Runnable + tested.
- **Phase 2 — React UI (next):** the 5 screens.
- Phase 3 — polish (URL-paste UX, MillionVerifier, presets).

### Run the backend
```
cd backend
python -m pip install -r requirements.txt      # first time only
START_BACKEND.bat                               # or: uvicorn app:app --host 127.0.0.1 --port 8000
```
Then open **http://127.0.0.1:8000/docs** — an interactive page to try every
endpoint (this is FastAPI's built-in UI; the React app comes in Phase 2).

### First steps in /docs
1. `POST /api/settings` — paste your Apollo **master** API key (saved locally to
   `backend/settings.json`, which is gitignored).
2. `POST /api/preview` — give a `name` and either `filters` or an `apollo_url`.
   FREE: returns people → firms → estimated credit cost + a 10-row sample.
3. `POST /api/enrich` — `name`, `max_credits`, `confirmed: true`. SPENDS CREDITS;
   streams progress; resumes without re-charging.
4. `GET /api/runs/{name}/export` — download the finished CSV.

### Endpoints
| Method | Path | Cost |
|---|---|---|
| POST | /api/preview | free |
| POST | /api/enrich | credits |
| POST | /api/parse-url | free |
| GET | /api/runs, /api/runs/{name} | free |
| GET | /api/runs/{name}/export | free |
| GET/POST | /api/settings | free |

### Safety (built into the engine)
- Dry-run preview before any spend; enrich needs `confirmed:true` + a `max_credits` cap.
- Resume by person_id — never re-charges an already-revealed contact.
- Checkpoint to disk every 10 reveals; seniority-ordered spend.
- Key stored locally, gitignored; server binds to 127.0.0.1 only.
- The de-duplication and suppression logic lives in `backend/core/picker.py`
  and `backend/core/suppression.py`.
