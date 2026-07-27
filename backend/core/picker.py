"""
picker.py — best-decision-maker selection + firm de-duplication.
Pure logic, no network. Ported from the tested apollo_api_leads.py.
"""
import re

# pecking order: lower index = better contact. Checked as "title contains word".
SENIORITY = [
    "owner", "founder", "managing partner", "managing director",
    "president", "ceo", "chief executive", "partner", "principal", "director",
]


def title_rank(title: str) -> tuple:
    """(seniority_index, prefixed_penalty). Lower tuple = better contact.
    'plain beats prefixed' so Partner (0) beats Audit Partner (1)."""
    t = (title or "").lower().strip()
    for i, word in enumerate(SENIORITY):
        if word in t:
            penalty = 0 if t == word else 1
            return (i, penalty)
    return (len(SENIORITY), 9)


def norm_company(name: str) -> str:
    """Normalise a firm name so 'Smith & Co Ltd' == 'smith co' for matching."""
    n = (name or "").lower()
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    n = re.sub(r"\b(ltd|limited|llp|plc|co|company|accountants|accounting|"
               r"chartered|certified|the)\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def pick_winners(people: list) -> tuple:
    """Group people by firm, keep ONE best decision-maker per firm.
    Returns (winners, backups). Groups by company_id when present, else name."""
    firms = {}
    for p in people:
        key = p.get("company_id") or norm_company(p.get("company_name", ""))
        firms.setdefault(key, []).append(p)
    winners, backups = [], []
    for rows in firms.values():
        rows.sort(key=lambda r: title_rank(r.get("title", "")))
        winners.append(rows[0])
        backups.extend(rows[1:])
    # winners in seniority order so a credit cap lands on least-certain titles
    winners.sort(key=lambda r: title_rank(r.get("title", "")))
    return winners, backups
