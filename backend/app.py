"""
app.py — FastAPI backend for the Apollo Lead Tool (v1).
Binds to 127.0.0.1 only. Reuses the tested core/ logic.

Run:  uvicorn app:app --host 127.0.0.1 --port 8000 --reload
"""
import json
import os
import re
import time

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core import apollo, store
from core.filters import FilterSet, parse_apollo_url, ACCOUNTING_TAG
from core.picker import pick_winners
from core.suppression import load_suppression, apply_suppression

HERE = os.path.dirname(__file__)
SETTINGS_PATH = os.path.join(HERE, "settings.json")

app = FastAPI(title="Apollo Lead Tool")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173",
                   "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])

# junk titles / big firms filtered in code (belt & braces on top of Apollo)
TITLE_BL = re.compile(r"marketing|sales|hr\b|human resources|\bit\b|"
                      r"information technology|recruit|talent|non[- ]executive", re.I)
COMPANY_BL = re.compile(r"pwc|deloitte|kpmg|ernst\s*&?\s*young|\bey\b|bdo|"
                        r"grant thornton|rsm|azets|mazars|forvis|crowe|moore\b|"
                        r"xeinadin|tc group|baker tilly|marcum|cbiz|plante moran|"
                        r"withum|moss adams|armanino|eide bailly", re.I)


def _blacklist(rec):
    return bool(TITLE_BL.search(rec["title"]) or COMPANY_BL.search(rec["company_name"]))


def _load_settings():
    if os.path.exists(SETTINGS_PATH):
        return json.load(open(SETTINGS_PATH, encoding="utf-8"))
    return {}


def _api_key():
    key = _load_settings().get("apollo_api_key", "").strip()
    if not key:
        raise HTTPException(400, "No Apollo API key saved. Set it in Settings.")
    return key


# ---------------------------------------------------------------- models
class Settings(BaseModel):
    apollo_api_key: str = ""


class PreviewReq(BaseModel):
    name: str
    filters: dict | None = None
    apollo_url: str | None = None
    suppression_path: str | None = None
    max_pages: int = 60


class EnrichReq(BaseModel):
    name: str
    max_credits: int
    confirmed: bool = False


# ---------------------------------------------------------------- settings
@app.get("/api/settings")
def get_settings():
    s = _load_settings()
    key = s.get("apollo_api_key", "")
    return {"has_key": bool(key), "masked": (key[:6] + "…" if key else "")}


@app.post("/api/settings")
def save_settings(s: Settings):
    json.dump({"apollo_api_key": s.apollo_api_key.strip()},
              open(SETTINGS_PATH, "w", encoding="utf-8"))
    return {"ok": True}


# ---------------------------------------------------------------- url parse
@app.post("/api/parse-url")
def parse_url(body: dict):
    url = (body or {}).get("url", "")
    if not url:
        raise HTTPException(400, "No url provided.")
    return parse_apollo_url(url)


# ---------------------------------------------------------------- preview (free)
@app.post("/api/preview")
def preview(req: PreviewReq):
    key = _api_key()
    if req.apollo_url:
        parsed = parse_apollo_url(req.apollo_url)
        fs = FilterSet(**parsed["filters"])
        warnings = parsed["warnings"]
    else:
        fs = FilterSet(**(req.filters or {}))
        warnings = []
    payload = fs.to_api_payload()
    if not payload:
        raise HTTPException(400, "No filters given.")

    pages = []
    def on_page(pg, kept, total):
        pages.append((pg, kept, total))
    try:
        people, total = apollo.search_pool(payload, key, req.max_pages,
                                            on_page=on_page, blacklist=_blacklist)
    except apollo.AuthError as e:
        raise HTTPException(401, str(e))
    except apollo.ApolloError as e:
        raise HTTPException(502, str(e))

    winners, backups = pick_winners(people)

    removed = 0
    if req.suppression_path:
        names, domains = load_suppression(req.suppression_path)
        winners, removed = apply_suppression(winners, names, domains)

    meta = {
        "filters": fs.as_dict(), "total_entries": total,
        "people": len(people), "firms_before_suppression": len(winners) + removed,
        "firms": len(winners), "suppressed": removed,
        "status": "previewed", "credits_spent": 0, "warnings": warnings,
    }
    store.save_run(req.name, winners, backups, meta)
    return {
        **meta,
        "est_cost": len(winners),
        "sample": winners[:10],
    }


# ---------------------------------------------------------------- enrich (credits)
@app.post("/api/enrich")
def enrich(req: EnrichReq):
    if not req.confirmed:
        raise HTTPException(400, "Enrichment must be explicitly confirmed.")
    key = _api_key()
    run = store.get_run(req.name)
    if not run or not run.get("rows"):
        raise HTTPException(404, "Run not found — preview it first.")

    winners = run["rows"]
    prior = store.load_prior_emails(req.name)   # resume: never re-charge
    for w in winners:
        p = prior.get(w.get("person_id"))
        if p and p.get("email"):
            w["email"] = p["email"]
            w["email_status"] = p.get("email_status", "")

    def stream():
        spent = 0
        for w in winners:
            if w.get("email"):
                continue
            if spent >= req.max_credits:
                yield _sse({"type": "capped", "cap": req.max_credits}); break
            try:
                apollo.enrich_one(w, key)
            except apollo.ApolloError as e:
                yield _sse({"type": "error", "who": w["director_name"], "msg": str(e)})
                continue
            if w.get("email") and "email_not_unlocked" not in w["email"]:
                spent += 1
                yield _sse({"type": "email", "n": spent,
                            "name": w["director_name"], "company": w["company_name"],
                            "email": w["email"], "status": w["email_status"]})
            else:
                yield _sse({"type": "miss", "name": w["director_name"]})
            if spent and spent % 10 == 0:
                _save(req.name, winners, run, spent)
            time.sleep(0.6)
        got = sum(1 for w in winners if w.get("email"))
        _save(req.name, winners, run, spent, done=True)
        yield _sse({"type": "done", "credits_spent": spent,
                    "emails": got, "firms": len(winners)})

    return StreamingResponse(stream(), media_type="text/event-stream")


def _sse(obj):
    return f"data: {json.dumps(obj)}\n\n"


def _save(name, winners, run, spent, done=False):
    meta = {k: run[k] for k in run if k not in ("rows",)}
    meta.update({"status": "done" if done else "enriching",
                 "credits_spent": spent,
                 "emails": sum(1 for w in winners if w.get("email"))})
    backups = []  # backups already saved at preview
    store.save_run(name, winners, backups, meta)


# ---------------------------------------------------------------- runs
@app.get("/api/runs")
def runs():
    return store.list_runs()


@app.get("/api/runs/{name}")
def one_run(name: str):
    r = store.get_run(name)
    if not r:
        raise HTTPException(404, "Run not found.")
    return r


@app.get("/api/runs/{name}/export")
def export(name: str):
    path = store.leads_path(name)
    if not os.path.exists(path):
        raise HTTPException(404, "No leads file for this run.")
    return FileResponse(path, filename=f"{name}_leads.csv", media_type="text/csv")


@app.get("/api/health")
def health():
    return {"ok": True, "accounting_tag": ACCOUNTING_TAG}
