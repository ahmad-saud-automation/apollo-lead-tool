# Apollo Lead Tool

Every Apollo credit I spend buys a real firm I don't already have. That's the whole idea.

## Why I built it

On Apollo you pay a credit each time you reveal a verified email, and I was losing that money in two places.

The first is duplicates. One accountancy firm shows up three or four times, the owner, a partner, an office manager. Export the raw list and you're charged for each of them, even though you only ever need to reach one person at that firm.

The second is firms I already had. Re-run a similar search a month later and you pay all over again for companies sitting in my CRM.

Here's what that looked like in practice. Out of 2,500 credits I got 1,500 real firms and 1,000 duplicates, which were just different contacts at firms I'd already counted. A thousand credits gone for nothing new.

## How it stops that

Before it spends a single credit, it does two things.

**One decision maker per firm.** It groups results by company, and it's not fooled by naming, so "Smith & Co Ltd" and "Smith and Company" are treated as the same firm. Then it keeps only the most senior contact: owner first, then founder, managing partner, director, and so on. The others are kept as free backups rather than charged for.

**Skips firms I already own.** I point it at my existing leads and it strips those out up front, so I never pay twice for the same company.

In that 2,500 credit example, the thousand duplicate credits simply never get spent. They stay in my account and go towards a thousand more real firms instead. Same budget, more actual companies.

## Seeing the cost before paying it

This was the part I cared most about getting right.

There's a free preview. I enter a search and it tells me how many real firms I'll end up with and exactly what it'll cost in credits, with a 10 row sample, before anything is charged.

There's a hard credit cap. I set a maximum and it doesn't go past it, and it spends on the most senior contacts first so the budget goes to the best people.

And it's safe to stop. If a run gets interrupted, restarting never re-charges a contact that was already revealed.

## Running it

```
cd backend
python -m pip install -r requirements.txt
START_BACKEND.bat
```

Then open `http://127.0.0.1:8000/docs`, which is FastAPI's built in page for trying each endpoint. The React front end is the next phase, so for now that's the interface.

First few steps in there:

1. `POST /api/settings` with my Apollo master API key. It's saved to `backend/settings.json`, which is gitignored.
2. `POST /api/preview` with a name and either filters or an Apollo URL. Free. Returns people, then firms, then the estimated credit cost and a sample.
3. `POST /api/enrich` with a name, `max_credits` and `confirmed: true`. This one spends credits. It streams progress and resumes without re-charging.
4. `GET /api/runs/{name}/export` to download the CSV.

| Method | Path | Cost |
|---|---|---|
| POST | /api/preview | free |
| POST | /api/enrich | credits |
| POST | /api/parse-url | free |
| GET | /api/runs, /api/runs/{name} | free |
| GET | /api/runs/{name}/export | free |
| GET/POST | /api/settings | free |

## Where it's at

The backend engine is done. It's a FastAPI service wrapping the search, pick, enrich and suppression logic, and it's tested and runnable. The React UI with its five screens is next, and after that some polish: pasting an Apollo URL directly, MillionVerifier integration, saved presets.

`SPEC.md` has the full design if you want the detail.

## Safety, built into the engine rather than bolted on

- Dry run preview before any spend, and enrich won't move without `confirmed: true` and a credit cap.
- Resume works by person id, so an already revealed contact is never charged again.
- Checkpoints to disk every 10 reveals, and spends in seniority order so if it does stop early, it stopped on the right people.
- The API key is stored locally and gitignored, and the server only binds to 127.0.0.1.

The dedupe and suppression logic is in `backend/core/picker.py` and `backend/core/suppression.py` if you want to see how the grouping actually works.
