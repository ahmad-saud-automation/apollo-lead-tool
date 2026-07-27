"""
suppression.py — exclude firms you already own/contacted, so credits are never
spent twice. Reads a CSV (e.g. your paid leads or the pipeline sheet export),
collecting normalised company names + domains to skip.
"""
import csv
import os
import re
from .picker import norm_company


def load_suppression(path: str):
    """Return (names:set, domains:set) from a CSV. Absent file -> empty sets."""
    names, domains = set(), set()
    if not path or not os.path.exists(path):
        return names, domains
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            for k, v in r.items():
                if not v or not k:
                    continue
                kl = k.lower()
                if "company" in kl or "firm" in kl or kl == "name":
                    nn = norm_company(v)
                    if nn:
                        names.add(nn)
                if "website" in kl or "domain" in kl or "url" in kl:
                    d = re.sub(r"^https?://(www\.)?", "", v.strip().lower()).split("/")[0]
                    if "." in d:
                        domains.add(d)
    return names, domains


def apply_suppression(winners: list, names: set, domains: set) -> tuple:
    """Return (kept, removed_count)."""
    if not names and not domains:
        return winners, 0
    kept = [w for w in winners
            if norm_company(w.get("company_name", "")) not in names
            and (w.get("domain") or "\x00") not in domains]
    return kept, len(winners) - len(kept)
