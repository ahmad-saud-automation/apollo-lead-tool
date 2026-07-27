"""
filters.py — the filter model shared by BOTH v1 entry points:
  1. manual filter form  ->  FilterSet
  2. pasted Apollo URL    ->  parse_apollo_url() -> FilterSet
Both then render to the Apollo API payload via to_api_payload().
"""
from dataclasses import dataclass, field, asdict
from urllib.parse import urlparse, parse_qs, unquote

# Apollo's internal tag id for the "Accounting" industry (verified 2026-07-03).
ACCOUNTING_TAG = "5567ce1f7369643b78570000"


@dataclass
class FilterSet:
    person_titles: list = field(default_factory=list)
    person_not_titles: list = field(default_factory=list)
    locations: list = field(default_factory=list)            # org (Account HQ)
    employees_ranges: list = field(default_factory=list)     # e.g. ["2,20"]
    industry_tag_ids: list = field(default_factory=list)
    keywords: list = field(default_factory=list)
    email_status: list = field(default_factory=lambda: ["verified"])
    exclude_companies: list = field(default_factory=list)

    def to_api_payload(self) -> dict:
        """Render to the mixed_people search payload (only non-empty fields)."""
        p = {}
        if self.person_titles:      p["person_titles"] = self.person_titles
        if self.person_not_titles:  p["person_not_titles"] = self.person_not_titles
        if self.locations:          p["organization_locations"] = self.locations
        if self.employees_ranges:   p["organization_num_employees_ranges"] = self.employees_ranges
        if self.industry_tag_ids:   p["organization_industry_tag_ids"] = self.industry_tag_ids
        if self.keywords:           p["q_organization_keyword_tags"] = self.keywords
        if self.email_status:       p["contact_email_status"] = self.email_status
        return p

    def as_dict(self):
        return asdict(self)


# map Apollo URL param names -> our FilterSet field names
_URL_MAP = {
    "personTitles": "person_titles",
    "personNotTitles": "person_not_titles",
    "notPersonTitles": "person_not_titles",
    "personLocations": "locations",
    "organizationLocations": "locations",
    "organizationNumEmployeesRanges": "employees_ranges",
    "qOrganizationKeywordTags": "keywords",
    "organizationKeywordTags": "keywords",
    "organizationIndustryTagIds": "industry_tag_ids",
    "contactEmailStatusV2": "email_status",
    "contactEmailStatus": "email_status",
    "organizationNotNames": "exclude_companies",
}


def parse_apollo_url(url: str) -> dict:
    """Decode an Apollo people-search URL into a FilterSet dict + a report of
    what was/wasn't recovered. Apollo puts filters in the URL *fragment*
    (after #) using key[]=value array notation.

    Returns: {"filters": {...}, "found": [fields], "warnings": [str]}
    """
    fs = FilterSet(email_status=[], )  # start empty; only fill what URL has
    warnings = []

    # filters live after the '#', formatted like a query string
    frag = urlparse(url).fragment or url
    if "?" in frag:
        frag = frag.split("?", 1)[1]
    qs = parse_qs(frag, keep_blank_values=False)

    found = []
    for raw_key, values in qs.items():
        key = raw_key.replace("[]", "")
        field_name = _URL_MAP.get(key)
        if not field_name:
            continue
        vals = [unquote(v) for v in values if v]
        if vals:
            setattr(fs, field_name, vals)
            found.append(field_name)

    # sensible defaults / caveats
    if not fs.email_status:
        fs.email_status = ["verified"]
    if "industry_tag_ids" not in found:
        warnings.append(
            "Industry filter is often NOT in the URL — set it manually "
            "(Accounting tag is pre-available). Pool may be larger than expected.")
    if not found:
        warnings.append(
            "No recognisable filters found in this URL. Paste the full Apollo "
            "search URL (from the address bar after running a search).")

    return {"filters": fs.as_dict(), "found": found, "warnings": warnings}
