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


def matches_role(title: str, wanted: list) -> bool:
    """True if a title contains any of the wanted role phrases."""
    t = (title or "").lower()
    return any(w.lower().strip() in t for w in wanted if str(w).strip())


def pick_winners(people: list, target_titles: list | None = None,
                 strict_roles: bool = True) -> tuple:
    """Group people by firm and keep ONE contact per firm.

    target_titles empty  -> the built-in seniority order decides, owner first.
    target_titles set    -> only people whose title matches one of those roles are
                            eligible, so "I want Finance Directors" really does
                            return Finance Directors and not whoever outranks them.
    strict_roles         -> with target_titles set, a firm with nobody in that role
                            is dropped. Turn it off to fall back to the best
                            available contact at that firm instead.

    Returns (winners, backups).
    """
    wanted = [t for t in (target_titles or []) if str(t).strip()]
    firms = {}
    for p in people:
        key = p.get("company_id") or norm_company(p.get("company_name", ""))
        firms.setdefault(key, []).append(p)

    winners, backups = [], []
    for rows in firms.values():
        rows.sort(key=lambda r: title_rank(r.get("title", "")))
        pool = rows
        if wanted:
            hits = [r for r in rows if matches_role(r.get("title", ""), wanted)]
            if hits:
                pool = hits
            elif strict_roles:
                backups.extend(rows)          # nobody in that role here, skip the firm
                continue
        winners.append(pool[0])
        backups.extend([r for r in rows if r is not pool[0]])

    # winners in seniority order so a credit cap lands on the least certain titles
    winners.sort(key=lambda r: title_rank(r.get("title", "")))
    return winners, backups
