from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Kind = Literal["receivable", "payable", "cash", "custom"]
Direction = Literal["gave", "got"]

# Default wording per kind. A ledger can override both labels: that is the "dynamic" part.
DEFAULT_LABELS = {
    "receivable": ("You gave", "You got"),
    "payable": ("You paid", "You bought"),
    "cash": ("Cash out", "Cash in"),
    "custom": ("Out", "In"),
}


def _clean(v: str) -> str:
    return " ".join(v.split())


class LedgerIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: Kind
    gave_label: str | None = Field(default=None, max_length=32)
    got_label: str | None = Field(default=None, max_length=32)
    note: str = Field(default="", max_length=255)

    @field_validator("name", "note")
    @classmethod
    def clean(cls, v):
        return _clean(v)

    @field_validator("gave_label", "got_label")
    @classmethod
    def clean_label(cls, v):
        v = _clean(v) if v else v
        return v or None


class LedgerPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    gave_label: str | None = Field(default=None, min_length=1, max_length=32)
    got_label: str | None = Field(default=None, min_length=1, max_length=32)
    note: str | None = Field(default=None, max_length=255)


class LedgerOut(BaseModel):
    id: int
    name: str
    kind: Kind
    gave_label: str
    got_label: str
    note: str
    party_count: int = 0
    entry_count: int = 0
    balance: float = 0.0
    gave_total: float = 0.0
    got_total: float = 0.0


class PartyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=20)
    note: str = Field(default="", max_length=255)

    @field_validator("name", "note")
    @classmethod
    def clean(cls, v):
        return _clean(v)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v):
        return "".join(ch for ch in v if ch.isdigit() or ch == "+")


class PartyPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=255)


class PartyOut(BaseModel):
    id: int
    ledger_id: int
    name: str
    phone: str
    note: str
    balance: float = 0.0
    last_entry: date | None = None
    entry_count: int = 0


class EntryIn(BaseModel):
    ledger_id: int
    party_id: int | None = None
    direction: Direction
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    entry_date: date
    note: str = Field(default="", max_length=255)

    @field_validator("note")
    @classmethod
    def clean(cls, v):
        return _clean(v)


class EntryPatch(BaseModel):
    direction: Direction | None = None
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    entry_date: date | None = None
    note: str | None = Field(default=None, max_length=255)


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ledger_id: int
    ledger_name: str
    party_id: int | None
    party_name: str | None
    direction: Direction
    amount: float
    entry_date: date
    note: str
    # Running balance of the party (or of the ledger for party-less ledgers), set on party pages.
    running_balance: float | None = None
