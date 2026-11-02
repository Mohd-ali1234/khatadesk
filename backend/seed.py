"""Load sample data for a small neighbourhood shop. Replace with your own data:

    python seed.py          # only if the database is empty
    python seed.py --reset  # wipe everything first
"""
import random
import sys
from datetime import date, timedelta

from app.database import Base, SessionLocal, engine
from app.models import Entry, Ledger, Party


def seed(db, today: date | None = None):
    today = today or date.today()
    rnd = random.Random(7)

    customers = Ledger(name="Customers", kind="receivable", gave_label="You gave", got_label="You got",
                       note="Regulars who buy on credit")
    suppliers = Ledger(name="Suppliers", kind="payable", gave_label="You paid", got_label="You bought",
                       note="Wholesalers and distributors")
    cash = Ledger(name="Cash book", kind="cash", gave_label="Cash out", got_label="Cash in",
                  note="Counter sales and daily expenses")
    advances = Ledger(name="Staff advances", kind="custom", gave_label="Advance given", got_label="Repaid",
                      note="Money lent to staff against salary")
    db.add_all([customers, suppliers, cash, advances])
    db.flush()

    def parties(ledger, rows):
        out = []
        for name, phone in rows:
            p = Party(ledger_id=ledger.id, name=name, phone=phone)
            db.add(p)
            out.append(p)
        db.flush()
        return out

    cust = parties(customers, [
        ("Meera Joshi", "9820011122"), ("Ramesh Patil", "9833344455"), ("Sunita Verma", "9819922233"),
        ("Aslam Khan", "9867788990"), ("Kavita Rao", "9892211009"), ("Dinesh Nair", "9004455667"),
        ("Farida Shaikh", "9930011223"), ("Vijay Kulkarni", "9324455667"),
    ])
    supp = parties(suppliers, [
        ("Sharma Wholesale", "9811100011"), ("Gupta Dairy", "9822200022"), ("Bombay Beverages", "9833300033"),
    ])
    staff = parties(advances, [("Raju (helper)", "9876500011"), ("Pooja (counter)", "9876500022")])

    def add(ledger, party, direction, amount, days_ago, note=""):
        db.add(Entry(ledger_id=ledger.id, party_id=party.id if party else None, direction=direction,
                     amount=amount, entry_date=today - timedelta(days=days_ago), note=note))

    # Customers: credit sales every few days, payments now and then.
    weight = {0: 5, 1: 4, 2: 3, 3: 6, 4: 2, 5: 3, 6: 2, 7: 1}
    for d in range(75, -1, -1):
        for i, p in enumerate(cust):
            if rnd.random() < weight[i] / 28:
                add(customers, p, "gave", rnd.choice([180, 240, 320, 450, 560, 780, 1150, 1480]), d,
                    rnd.choice(["Groceries", "Monthly ration", "Oil and flour", "Snacks", "Milk and eggs", ""]))
    # Payments: each customer pays in two instalments, never more than they owe on that date.
    pay = {0: (3, 0.85), 1: (11, 0.6), 2: (2, 0.9), 3: (40, 0.3), 4: (5, 0.9), 5: (9, 0.7), 6: (18, 0.5), 7: (60, 0.2)}
    for i, p in enumerate(cust):
        days_since, share = pay[i]
        gaves = [e for e in db.new if isinstance(e, Entry) and e.party_id == p.id and e.direction == "gave"]
        owed = sum(float(e.amount) for e in gaves)
        pay_each = round(owed * share / 2 / 50) * 50
        for ago, note in ((days_since + 20, "Paid at counter"), (days_since, rnd.choice(["UPI", "Cash", "UPI"]))):
            day = today - timedelta(days=ago)
            balance = sum(float(e.amount) for e in db.new if isinstance(e, Entry) and e.party_id == p.id
                          and e.entry_date <= day and e.direction == "gave") - sum(
                float(e.amount) for e in db.new if isinstance(e, Entry) and e.party_id == p.id
                and e.entry_date <= day and e.direction == "got")
            amount = min(pay_each, max(0, balance // 10 * 10))
            if amount > 0:
                add(customers, p, "got", amount, ago, note)

    # Suppliers: stock bought on credit, partly paid.
    for d, p, amt, note in [(62, 0, 18400, "Rice, atta, dal"), (48, 1, 6200, "Milk and curd, fortnight"),
                            (40, 2, 9800, "Cold drinks crate"), (27, 0, 15750, "Oil, sugar, spices"),
                            (19, 1, 6900, "Milk and curd, fortnight"), (8, 0, 12300, "Monthly stock"),
                            (6, 2, 8400, "Juice and water")]:
        add(suppliers, supp[p], "got", amt, d, note)
    for d, p, amt, note in [(55, 0, 18400, "Cleared"), (33, 1, 6200, "Cleared"), (14, 0, 10000, "Part payment"),
                            (12, 1, 6000, "UPI"), (4, 2, 4000, "Part payment")]:
        add(suppliers, supp[p], "gave", amt, d, note)

    # Cash book: counter sales most days, a few expenses.
    for d in range(60, -1, -1):
        day = today - timedelta(days=d)
        base = 4200 if day.weekday() >= 5 else 3100
        add(cash, None, "got", round(base * rnd.uniform(0.7, 1.3) / 10) * 10, d, "Counter sales")
        if d % 7 == 0:
            add(cash, None, "gave", rnd.choice([450, 600, 900]), d, "Packing and transport")
        if d % 7 == 3:
            add(cash, None, "gave", 14000, d, "Deposited to bank")
    for d, amt, note in [(58, 14000, "Shop rent"), (28, 14000, "Shop rent"), (1, 14000, "Shop rent"),
                         (45, 2150, "Electricity bill"), (15, 2480, "Electricity bill")]:
        add(cash, None, "gave", amt, d, note)

    # Staff advances.
    add(advances, staff[0], "gave", 3000, 30, "Festival advance")
    add(advances, staff[0], "got", 1000, 16, "Deducted from salary")
    add(advances, staff[1], "gave", 1500, 9, "Medical")

    db.commit()


if __name__ == "__main__":
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.query(Ledger).count():
            print("Database already has data. Use --reset to wipe and reseed.")
        else:
            seed(db)
            print("Sample data loaded.")
