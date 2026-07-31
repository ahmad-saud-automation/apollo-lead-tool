"""
revealed.py - the memory of every email already paid for, across ALL past runs.

Without this, a contact revealed in January gets charged again in February, because
resume only ever looked inside a single run. This scans every run on disk and builds
two indexes:

  by_person  person_id -> the revealed row. Exact, used to reuse an email for free.
  by_firm    normalised company name -> revealed row. Catches the same firm coming
             back under a different contact id, which is the common case.

Pure file reading, no network.
"""
from __future__ import annotations

import csv
import os

from .picker import norm_company


def _runs_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "runs")


def load_all_revealed(exclude_run: str | None = None) -> dict:
    """Index every already-revealed contact from every run."""
    by_person, by_firm = {}, {}
    base = _runs_dir()
    if not os.path.isdir(base):
        return {"by_person": by_person, "by_firm": by_firm, "runs": 0, "emails": 0}

    runs = 0
    for name in sorted(os.listdir(base)):
        if exclude_run and name == exclude_run:
            continue
        path = os.path.join(base, name, "leads.csv")
        if not os.path.exists(path):
            continue
        runs += 1
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                email = (r.get("email") or "").strip()
                if not email or "not_unlocked" in email:
                    continue
                r["_run"] = name
                pid = (r.get("person_id") or "").strip()
                if pid:
                    by_person.setdefault(pid, r)
                firm = norm_company(r.get("company_name", ""))
                if firm:
                    by_firm.setdefault(firm, r)
    return {"by_person": by_person, "by_firm": by_firm,
            "runs": runs, "emails": len(by_person)}


def match(row: dict, index: dict) -> dict | None:
    """The already-revealed row for this lead, by person first then by firm."""
    pid = (row.get("person_id") or "").strip()
    if pid and pid in index["by_person"]:
        return index["by_person"][pid]
    firm = norm_company(row.get("company_name", ""))
    if firm and firm in index["by_firm"]:
        return index["by_firm"][firm]
    return None


def split_already_revealed(rows: list, index: dict) -> tuple:
    """(fresh, already_revealed). Used at preview so the credit estimate is honest
    about what you would not be charged for."""
    fresh, seen = [], []
    for r in rows:
        hit = match(r, index)
        (seen if hit else fresh).append(r)
    return fresh, seen


def stats() -> dict:
    idx = load_all_revealed()
    return {"runs": idx["runs"], "emails": idx["emails"], "firms": len(idx["by_firm"])}
