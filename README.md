# Apollo Lead Tool

Production-quality personal app: Apollo search → best-decision-maker per firm →
verified emails, with credit caps / dry-run / resume. See `SPEC.md` for the full design.

## Status
- **Phase 1 — backend engine (DONE):** FastAPI service wrapping the tested
  search / pick / enrich / suppression logic. Runnable + tested.
- **Phase 2 — React UI (next):** the 5 screens.
- Phase 3 — polish (URL-paste UX, MillionVerifier, presets).

## Run the backend
```
cd backend
python -m pip install -r requirements.txt      # first time only
START_BACKEND.bat                               # or: uvicorn app:app --host 127.0.0.1 --port 8000
```
Then open **http://127.0.0.1:8000/docs** — an interactive page to try every
endpoint (this is FastAPI's built-in UI; the React app comes in Phase 2).

## First steps in /docs
1. `POST /api/settings` — paste your Apollo **master** API key (saved locally to
   `backend/settings.json`, which is gitignored).
2. `POST /api/preview` — give a `name` and either `filters` or an `apollo_url`.
   FREE: returns people → firms → estimated credit cost + a 10-row sample.
3. `POST /api/enrich` — `name`, `max_credits`, `confirmed: true`. SPENDS CREDITS;
   streams progress; resumes without re-charging.
4. `GET /api/runs/{name}/export` — download the finished CSV.

## Endpoints
| Method | Path | Cost |
|---|---|---|
| POST | /api/preview | free |
| POST | /api/enrich | credits |
| POST | /api/parse-url | free |
| GET | /api/runs, /api/runs/{name} | free |
| GET | /api/runs/{name}/export | free |
| GET/POST | /api/settings | free |

## Safety (built into the engine)
- Dry-run preview before any spend; enrich needs `confirmed:true` + a `max_credits` cap.
- Resume by person_id — never re-charges an already-revealed contact.
- Checkpoint to disk every 10 reveals; seniority-ordered spend.
- Key stored locally, gitignored; server binds to 127.0.0.1 only.
