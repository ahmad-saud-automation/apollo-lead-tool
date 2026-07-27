"""
apollo.py — Apollo API client: search (free) + enrich (credits).
Ported from the tested apollo_api_leads.py. Uses callbacks for progress so the
web layer can stream updates instead of printing.
"""
import json
import time
import urllib.request
import urllib.error

API_BASE = "https://api.apollo.io/api/v1"


class ApolloError(Exception):
    pass


class AuthError(ApolloError):
    pass


def _call(path: str, payload: dict, key: str, retries: int = 4):
    url = f"{API_BASE}/{path}"
    body = json.dumps(payload).encode()
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": key,
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(15 * (attempt + 1))
                continue
            if e.code in (401, 403):
                raise AuthError(
                    f"Auth error {e.code}: key must be a MASTER key and your "
                    f"plan must include API search access.")
            raise ApolloError(f"HTTP {e.code} from Apollo ({path}).")
    raise ApolloError("Apollo API not responding after retries — try later.")


def search_pool(api_payload: dict, key: str, max_pages: int = 60,
                per_page: int = 100, on_page=None, blacklist=None):
    """Pull everyone matching the filters. Free. blacklist(rec)->bool drops rows.
    on_page(page, total_kept, total_entries) is called after each page."""
    people, page = [], 1
    total_entries = None
    while page <= max_pages:
        payload = dict(api_payload)
        payload.update({"page": page, "per_page": per_page})
        data = _call("mixed_people/api_search", payload, key)
        batch = data.get("people", []) + data.get("contacts", [])
        if total_entries is None:
            total_entries = data.get("total_entries") or \
                (data.get("pagination") or {}).get("total_entries")
        if not batch:
            break
        for p in batch:
            org = p.get("organization") or {}
            rec = {
                "person_id":   p.get("id", ""),
                "director_name": (p.get("name") or
                                  f"{p.get('first_name','')} {p.get('last_name','')}".strip()),
                "title":       p.get("title") or "",
                "company_name": org.get("name") or "",
                "company_id":  org.get("id") or "",
                "domain":      org.get("primary_domain") or "",
                "employees":   org.get("estimated_num_employees") or "",
                "location":    ", ".join(x for x in [p.get("city"), p.get("country")] if x),
                "linkedin_url": p.get("linkedin_url") or "",
                "email": "", "email_status": "",
            }
            if blacklist and blacklist(rec):
                continue
            if rec["director_name"] and rec["company_name"]:
                people.append(rec)
        if on_page:
            on_page(page, len(people), total_entries)
        page += 1
        time.sleep(1.2)
    return people, total_entries


def enrich_one(winner: dict, key: str) -> dict:
    """Reveal one winner's email. SPENDS 1 CREDIT if data returns. Mutates and
    returns the winner. Matches by Apollo person id (exact) when available."""
    payload = {"reveal_personal_emails": False}
    if winner.get("person_id"):
        payload["id"] = winner["person_id"]
    else:
        payload["name"] = winner["director_name"]
        payload["organization_name"] = winner["company_name"]
        if winner.get("domain"):
            payload["domain"] = winner["domain"]
    data = _call("people/match", payload, key)
    person = data.get("person") or {}
    winner["email"] = person.get("email") or ""
    winner["email_status"] = person.get("email_status") or ""
    if person.get("name"):
        winner["director_name"] = person["name"]
    porg = person.get("organization") or {}
    winner["domain"] = winner.get("domain") or porg.get("primary_domain") or ""
    winner["linkedin_url"] = winner.get("linkedin_url") or person.get("linkedin_url") or ""
    winner["employees"] = winner.get("employees") or porg.get("estimated_num_employees") or ""
    winner["location"] = winner.get("location") or ", ".join(
        x for x in [person.get("city"), person.get("state"), person.get("country")] if x)
    winner["founded_year"] = porg.get("founded_year") or ""
    winner["industry"] = porg.get("industry") or ""
    kw = porg.get("keywords") or []
    winner["org_keywords"] = ", ".join(kw[:12]) if isinstance(kw, list) else str(kw)
    return winner
