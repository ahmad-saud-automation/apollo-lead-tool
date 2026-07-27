"""
store.py — local run storage. Each run is a folder under runs/<name>/ holding
leads.csv (winners), backup.csv (spare partners) and run.json (metadata).
No database — files only.
"""
import csv
import json
import os
import re
import time

RUNS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "runs")

CSV_COLS = ["person_id", "director_name", "title", "company_name", "domain",
            "email", "email_status", "employees", "location", "founded_year",
            "industry", "org_keywords", "linkedin_url"]


def _safe(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", (name or "run")).strip("_") or "run"


def run_dir(name: str) -> str:
    d = os.path.join(RUNS_DIR, _safe(name))
    os.makedirs(d, exist_ok=True)
    return d


def write_csv(path: str, rows: list):
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def save_run(name: str, winners: list, backups: list, meta: dict):
    d = run_dir(name)
    write_csv(os.path.join(d, "leads.csv"), winners)
    write_csv(os.path.join(d, "backup.csv"), backups)
    meta = dict(meta, name=name, updated=time.strftime("%Y-%m-%d %H:%M:%S"))
    with open(os.path.join(d, "run.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    return d


def load_prior_emails(name: str) -> dict:
    """person_id -> revealed row, from this run's leads.csv (resume, no re-spend)."""
    prev = {}
    path = os.path.join(run_dir(name), "leads.csv")
    if os.path.exists(path):
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if r.get("email") and r.get("person_id"):
                    prev[r["person_id"]] = r
    return prev


def list_runs() -> list:
    out = []
    if not os.path.isdir(RUNS_DIR):
        return out
    for name in sorted(os.listdir(RUNS_DIR)):
        meta_path = os.path.join(RUNS_DIR, name, "run.json")
        if os.path.exists(meta_path):
            try:
                out.append(json.load(open(meta_path, encoding="utf-8")))
            except OSError:
                continue
    return sorted(out, key=lambda m: m.get("updated", ""), reverse=True)


def get_run(name: str) -> dict:
    meta_path = os.path.join(run_dir(name), "run.json")
    if not os.path.exists(meta_path):
        return {}
    meta = json.load(open(meta_path, encoding="utf-8"))
    rows = []
    leads = os.path.join(run_dir(name), "leads.csv")
    if os.path.exists(leads):
        rows = list(csv.DictReader(open(leads, encoding="utf-8-sig")))
    meta["rows"] = rows
    return meta


def leads_path(name: str) -> str:
    return os.path.join(run_dir(name), "leads.csv")
