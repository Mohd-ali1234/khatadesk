import csv
import io
import os
import threading
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import services
from .database import Base, engine, get_db
from .models import Entry, Ledger, Party
from .schemas import (
    DEFAULT_LABELS,
    EntryIn,
    EntryOut,
    EntryPatch,
    LedgerIn,
    LedgerOut,
    LedgerPatch,
    PartyIn,
    PartyOut,
    PartyPatch,
)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="KhataDesk API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- helpers


def get_ledger(db: Session, ledger_id: int) -> Ledger:
    ledger = db.get(Ledger, ledger_id)
    if not ledger:
        raise HTTPException(404, "Ledger not found")
    return ledger


def get_party(db: Session, party_id: int) -> Party:
    party = db.get(Party, party_id)
    if not party:
        raise HTTPException(404, "Party not found")
    return party


def ledger_out(ledger: Ledger, stats: dict) -> LedgerOut:
    s = stats.get(ledger.id, {})
    return LedgerOut(
        id=ledger.id,
        name=ledger.name,
        kind=ledger.kind,
        gave_label=ledger.gave_label,
        got_label=ledger.got_label,
        note=ledger.note,
        party_count=s.get("party_count", 0),
        entry_count=s.get("entry_count", 0),
        balance=s.get("balance", 0.0),
        gave_total=s.get("gave_total", 0.0),
        got_total=s.get("got_total", 0.0),
    )


def party_out(p: Party, stats: dict) -> PartyOut:
    s = stats.get(p.id, {})
    return PartyOut(
        id=p.id,
        ledger_id=p.ledger_id,
        name=p.name,
        phone=p.phone,
        note=p.note,
        balance=s.get("balance", 0.0),
        last_entry=s.get("last_entry"),
        entry_count=s.get("entry_count", 0),
    )


def entry_out(e: Entry, running: dict | None = None) -> EntryOut:
    return EntryOut(
        id=e.id,
        ledger_id=e.ledger_id,
        ledger_name=e.ledger.name,
        party_id=e.party_id,
        party_name=e.party.name if e.party else None,
        direction=e.direction,
        amount=services.f(e.amount),
        entry_date=e.entry_date,
        note=e.note,
        running_balance=running.get(e.id) if running is not None else None,
    )


def check_entry_target(db: Session, ledger_id: int, party_id: int | None) -> Ledger:
    ledger = get_ledger(db, ledger_id)
    if ledger.kind == "cash":
        if party_id is not None:
            raise HTTPException(422, "A cash book has no parties")
    else:
        if party_id is None:
            raise HTTPException(422, "Choose who this entry is for")
        party = get_party(db, party_id)
        if party.ledger_id != ledger.id:
            raise HTTPException(422, "That party belongs to a different ledger")
    return ledger


# --------------------------------------------------------------------------- ledgers


@app.get("/api/ledgers", response_model=list[LedgerOut])
def list_ledgers(db: Session = Depends(get_db)):
    stats = services.ledger_stats(db)
    ledgers = db.scalars(select(Ledger).order_by(Ledger.id)).all()
    return [ledger_out(l, stats) for l in ledgers]


@app.post("/api/ledgers", response_model=LedgerOut, status_code=201)
def create_ledger(body: LedgerIn, db: Session = Depends(get_db)):
    gave, got = DEFAULT_LABELS[body.kind]
    ledger = Ledger(
        name=body.name,
        kind=body.kind,
        gave_label=body.gave_label or gave,
        got_label=body.got_label or got,
        note=body.note,
    )
    db.add(ledger)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You already have a ledger with that name")
    return ledger_out(ledger, {})


@app.get("/api/ledgers/{ledger_id}", response_model=LedgerOut)
def read_ledger(ledger_id: int, db: Session = Depends(get_db)):
    ledger = get_ledger(db, ledger_id)
    return ledger_out(ledger, services.ledger_stats(db))


@app.patch("/api/ledgers/{ledger_id}", response_model=LedgerOut)
def update_ledger(ledger_id: int, body: LedgerPatch, db: Session = Depends(get_db)):
    ledger = get_ledger(db, ledger_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(ledger, k, " ".join(v.split()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You already have a ledger with that name")
    return ledger_out(ledger, services.ledger_stats(db))


@app.delete("/api/ledgers/{ledger_id}", status_code=204)
def delete_ledger(ledger_id: int, db: Session = Depends(get_db)):
    db.delete(get_ledger(db, ledger_id))
    db.commit()


# --------------------------------------------------------------------------- parties


@app.get("/api/ledgers/{ledger_id}/parties", response_model=list[PartyOut])
def list_parties(ledger_id: int, q: str = "", db: Session = Depends(get_db)):
    get_ledger(db, ledger_id)
    query = select(Party).where(Party.ledger_id == ledger_id).order_by(Party.name)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Party.name.like(like), Party.phone.like(like)))
    stats = services.party_stats(db, ledger_id=ledger_id)
    return [party_out(p, stats) for p in db.scalars(query).all()]


@app.post("/api/ledgers/{ledger_id}/parties", response_model=PartyOut, status_code=201)
def create_party(ledger_id: int, body: PartyIn, db: Session = Depends(get_db)):
    ledger = get_ledger(db, ledger_id)
    if ledger.kind == "cash":
        raise HTTPException(422, "A cash book has no parties")
    party = Party(ledger_id=ledger_id, **body.model_dump())
    db.add(party)
    db.commit()
    return party_out(party, {})


@app.get("/api/parties/{party_id}", response_model=PartyOut)
def read_party(party_id: int, db: Session = Depends(get_db)):
    party = get_party(db, party_id)
    return party_out(party, services.party_stats(db, party_id=party_id))


@app.patch("/api/parties/{party_id}", response_model=PartyOut)
def update_party(party_id: int, body: PartyPatch, db: Session = Depends(get_db)):
    party = get_party(db, party_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(party, k, v)
    db.commit()
    return party_out(party, services.party_stats(db, party_id=party_id))


@app.delete("/api/parties/{party_id}", status_code=204)
def delete_party(party_id: int, db: Session = Depends(get_db)):
    db.delete(get_party(db, party_id))
    db.commit()


# --------------------------------------------------------------------------- entries


def _entries_query(
    ledger_id, party_id, date_from, date_to, direction, q
):
    query = (
        select(Entry)
        .outerjoin(Party, Party.id == Entry.party_id)
        .order_by(Entry.entry_date.desc(), Entry.id.desc())
    )
    if ledger_id is not None:
        query = query.where(Entry.ledger_id == ledger_id)
    if party_id is not None:
        query = query.where(Entry.party_id == party_id)
    if date_from:
        query = query.where(Entry.entry_date >= date_from)
    if date_to:
        query = query.where(Entry.entry_date <= date_to)
    if direction:
        query = query.where(Entry.direction == direction)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Entry.note.like(like), Party.name.like(like)))
    return query


@app.get("/api/entries")
def list_entries(
    ledger_id: int | None = None,
    party_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    direction: str | None = Query(default=None, pattern="^(gave|got)$"),
    q: str = "",
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = _entries_query(ledger_id, party_id, date_from, date_to, direction, q)
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    rows = db.scalars(query.limit(limit).offset(offset)).all()

    # Sums over the whole filter (not just this page).
    sums = {"gave": 0, "got": 0}
    sub = query.order_by(None).subquery()
    for d, s in db.execute(select(sub.c.direction, func.sum(sub.c.amount)).group_by(sub.c.direction)).all():
        sums[d] = services.f(s)

    running = None
    if party_id is not None or ledger_id is not None:
        if party_id is not None:
            scope = select(Entry).where(Entry.party_id == party_id)
        else:
            scope = select(Entry).where(Entry.ledger_id == ledger_id)
        all_scope = db.scalars(scope).all()
        if all_scope:
            kind = all_scope[0].ledger.kind
            running = services.running_balances(all_scope, kind)
    return {
        "items": [entry_out(e, running) for e in rows],
        "total": total,
        "gave_sum": sums["gave"],
        "got_sum": sums["got"],
    }


@app.get("/api/entries.csv")
def export_entries(
    ledger_id: int | None = None,
    party_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    direction: str | None = Query(default=None, pattern="^(gave|got)$"),
    q: str = "",
    db: Session = Depends(get_db),
):
    rows = db.scalars(_entries_query(ledger_id, party_id, date_from, date_to, direction, q)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Ledger", "Party", "Type", "Amount", "Note"])
    for e in rows:
        label = e.ledger.gave_label if e.direction == "gave" else e.ledger.got_label
        w.writerow([e.entry_date.isoformat(), e.ledger.name, e.party.name if e.party else "", label, f"{e.amount:.2f}", e.note])
    return Response(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="khata-entries.csv"'},
    )


@app.post("/api/entries", response_model=EntryOut, status_code=201)
def create_entry(body: EntryIn, db: Session = Depends(get_db)):
    check_entry_target(db, body.ledger_id, body.party_id)
    entry = Entry(**body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry_out(entry)


@app.patch("/api/entries/{entry_id}", response_model=EntryOut)
def update_entry(entry_id: int, body: EntryPatch, db: Session = Depends(get_db)):
    entry = db.get(Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(entry, k, v)
    db.commit()
    db.refresh(entry)
    return entry_out(entry)


@app.delete("/api/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    db.delete(entry)
    db.commit()


# --------------------------------------------------------------------------- dashboard


@app.get("/api/dashboard")
def read_dashboard(db: Session = Depends(get_db)):
    return services.dashboard(db)


# --------------------------------------------------------------------------- desktop app

# Set by desktop.py, the launcher inside the Windows installer.
DESKTOP = os.getenv("KHATA_DESKTOP") == "1"


@app.get("/api/meta")
def meta():
    return {"desktop": DESKTOP, "database": engine.dialect.name}


@app.post("/api/shutdown", status_code=202)
def shutdown(request: Request):
    """Quit button of the desktop app. Needs a custom header, which other websites cannot send."""
    if not DESKTOP or request.headers.get("x-khata") != "1":
        raise HTTPException(403, "Not allowed")
    threading.Timer(0.4, lambda: os._exit(0)).start()
    return {"ok": True}


# --------------------------------------------------------------------------- built frontend

DIST = Path(os.getenv("KHATA_DIST") or Path(__file__).resolve().parents[2] / "frontend" / "dist")
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        file = DIST / path
        return FileResponse(file if path and file.is_file() else DIST / "index.html")
