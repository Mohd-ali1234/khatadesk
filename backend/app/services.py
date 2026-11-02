"""Balance rules and dashboard numbers. Every total is summed from entries in SQL."""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from .models import Entry, Ledger, Party


def signed_amount():
    """+amount when the entry raises the ledger's balance, -amount when it lowers it.

    receivable: gave (credit sale) raises what you are owed, got (payment) lowers it.
    payable / cash / custom: got raises the balance, gave lowers it.
    """
    raises = case(
        (and_(Ledger.kind == "receivable", Entry.direction == "gave"), 1),
        (and_(Ledger.kind != "receivable", Entry.direction == "got"), 1),
        else_=-1,
    )
    return raises * Entry.amount


def f(x) -> float:
    return float(Decimal(x or 0).quantize(Decimal("0.01")))


def ledger_stats(db: Session) -> dict[int, dict]:
    rows = db.execute(
        select(
            Entry.ledger_id,
            func.count(Entry.id),
            func.coalesce(func.sum(signed_amount()), 0),
            func.coalesce(func.sum(case((Entry.direction == "gave", Entry.amount), else_=0)), 0),
            func.coalesce(func.sum(case((Entry.direction == "got", Entry.amount), else_=0)), 0),
        )
        .join(Ledger, Ledger.id == Entry.ledger_id)
        .group_by(Entry.ledger_id)
    ).all()
    stats = {
        lid: {"entry_count": n, "balance": f(bal), "gave_total": f(g), "got_total": f(r)}
        for lid, n, bal, g, r in rows
    }
    parties = dict(db.execute(select(Party.ledger_id, func.count(Party.id)).group_by(Party.ledger_id)).all())
    for lid, n in parties.items():
        stats.setdefault(lid, {"entry_count": 0, "balance": 0.0, "gave_total": 0.0, "got_total": 0.0})
        stats[lid]["party_count"] = n
    return stats


def party_stats(db: Session, ledger_id: int | None = None, party_id: int | None = None) -> dict[int, dict]:
    q = (
        select(
            Entry.party_id,
            func.count(Entry.id),
            func.coalesce(func.sum(signed_amount()), 0),
            func.max(Entry.entry_date),
        )
        .join(Ledger, Ledger.id == Entry.ledger_id)
        .where(Entry.party_id.is_not(None))
        .group_by(Entry.party_id)
    )
    if ledger_id is not None:
        q = q.where(Entry.ledger_id == ledger_id)
    if party_id is not None:
        q = q.where(Entry.party_id == party_id)
    return {
        pid: {"entry_count": n, "balance": f(bal), "last_entry": last}
        for pid, n, bal, last in db.execute(q).all()
    }


def _sum(db: Session, *conds) -> Decimal:
    q = select(func.coalesce(func.sum(Entry.amount), 0)).join(Ledger, Ledger.id == Entry.ledger_id)
    for c in conds:
        q = q.where(c)
    return Decimal(db.execute(q).scalar_one())


def sales_filter():
    # Sales = goods given on credit + cash coming into a cash book.
    return ((Ledger.kind == "receivable") & (Entry.direction == "gave")) | (
        (Ledger.kind == "cash") & (Entry.direction == "got")
    )


def dashboard(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    month_start = today.replace(day=1)
    prev_end = month_start - timedelta(days=1)
    prev_start = prev_end.replace(day=1)
    # Same number of days into last month, so the comparison is like for like.
    prev_same = min(prev_start + timedelta(days=today.day - 1), prev_end)

    def in_range(a: date, b: date):
        return and_(Entry.entry_date >= a, Entry.entry_date <= b)

    sales_month = _sum(db, sales_filter(), in_range(month_start, today))
    sales_prev = _sum(db, sales_filter(), in_range(prev_start, prev_same))
    sales_today = _sum(db, sales_filter(), Entry.entry_date == today)
    collected_month = _sum(
        db, Ledger.kind == "receivable", Entry.direction == "got", in_range(month_start, today)
    )
    collected_prev = _sum(
        db, Ledger.kind == "receivable", Entry.direction == "got", in_range(prev_start, prev_same)
    )

    # Daily sales for the last 30 days, zero-filled.
    start30 = today - timedelta(days=29)
    by_day = dict(
        db.execute(
            select(Entry.entry_date, func.sum(Entry.amount))
            .join(Ledger, Ledger.id == Entry.ledger_id)
            .where(sales_filter(), in_range(start30, today))
            .group_by(Entry.entry_date)
        ).all()
    )
    daily = [
        {"date": (start30 + timedelta(days=i)).isoformat(), "amount": f(by_day.get(start30 + timedelta(days=i), 0))}
        for i in range(30)
    ]

    # Party balances split by ledger kind.
    rows = db.execute(
        select(
            Party.id,
            Party.name,
            Party.phone,
            Party.ledger_id,
            Ledger.name,
            Ledger.kind,
            func.coalesce(func.sum(signed_amount()), 0),
            func.max(Entry.entry_date),
            func.max(case((Entry.direction == "got", Entry.entry_date))),
        )
        .join(Ledger, Ledger.id == Party.ledger_id)
        .join(Entry, Entry.party_id == Party.id)
        .group_by(Party.id, Party.name, Party.phone, Party.ledger_id, Ledger.name, Ledger.kind)
    ).all()

    debtors, creditors = [], []
    for pid, pname, phone, lid, lname, kind, bal, last_any, last_got in rows:
        bal = f(bal)
        if bal <= 0 or kind not in ("receivable", "payable"):
            continue
        item = {
            "party_id": pid,
            "name": pname,
            "phone": phone,
            "ledger_id": lid,
            "ledger_name": lname,
            "balance": bal,
            "last_entry": last_any.isoformat() if last_any else None,
        }
        if kind == "receivable":
            # For a customer, "last payment" is the last time they paid us.
            item["last_payment"] = last_got.isoformat() if last_got else None
            debtors.append(item)
        else:
            creditors.append(item)
    debtors.sort(key=lambda x: -x["balance"])
    creditors.sort(key=lambda x: -x["balance"])

    cash_in_hand = db.execute(
        select(func.coalesce(func.sum(signed_amount()), 0))
        .join(Ledger, Ledger.id == Entry.ledger_id)
        .where(Ledger.kind == "cash")
    ).scalar_one()

    recent = db.execute(
        select(Entry, Ledger.name, Party.name)
        .join(Ledger, Ledger.id == Entry.ledger_id)
        .outerjoin(Party, Party.id == Entry.party_id)
        .order_by(Entry.entry_date.desc(), Entry.id.desc())
        .limit(6)
    ).all()

    counts = {
        "ledgers": db.scalar(select(func.count(Ledger.id))),
        "parties": db.scalar(select(func.count(Party.id))),
        "entries": db.scalar(select(func.count(Entry.id))),
    }

    return {
        "today": today.isoformat(),
        "month_start": month_start.isoformat(),
        "prev_same_day": prev_same.isoformat(),
        "to_receive": f(sum(d["balance"] for d in debtors)),
        "debtor_count": len(debtors),
        "to_pay": f(sum(c["balance"] for c in creditors)),
        "creditor_count": len(creditors),
        "cash_in_hand": f(cash_in_hand),
        "sales_today": f(sales_today),
        "sales_month": f(sales_month),
        "sales_prev_period": f(sales_prev),
        "collected_month": f(collected_month),
        "collected_prev_period": f(collected_prev),
        "daily_sales": daily,
        "top_debtors": debtors[:5],
        "top_creditors": creditors[:3],
        "recent": [
            {
                "id": e.id,
                "ledger_id": e.ledger_id,
                "ledger_name": lname,
                "party_id": e.party_id,
                "party_name": pname,
                "direction": e.direction,
                "amount": f(e.amount),
                "entry_date": e.entry_date.isoformat(),
                "note": e.note,
            }
            for e, lname, pname in recent
        ],
        "counts": counts,
    }


def running_balances(entries: list[Entry], kind: str) -> dict[int, float]:
    """Running balance after each entry, oldest first. Computed in Decimal."""
    out: dict[int, float] = defaultdict(float)
    total = Decimal(0)
    for e in sorted(entries, key=lambda e: (e.entry_date, e.id)):
        raises = (e.direction == "gave") if kind == "receivable" else (e.direction == "got")
        total += e.amount if raises else -e.amount
        out[e.id] = f(total)
    return out
