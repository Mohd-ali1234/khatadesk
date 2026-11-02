import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return TestClient(app)


def mk_ledger(c, name="Customers", kind="receivable", **kw):
    r = c.post("/api/ledgers", json={"name": name, "kind": kind, **kw})
    assert r.status_code == 201, r.text
    return r.json()


def mk_party(c, ledger_id, name="Meera"):
    r = c.post(f"/api/ledgers/{ledger_id}/parties", json={"name": name, "phone": "98 200-11122"})
    assert r.status_code == 201, r.text
    return r.json()


def mk_entry(c, ledger_id, party_id, direction, amount, day="2026-11-01", note=""):
    r = c.post("/api/entries", json={"ledger_id": ledger_id, "party_id": party_id, "direction": direction,
                                     "amount": amount, "entry_date": day, "note": note})
    assert r.status_code == 201, r.text
    return r.json()


def test_default_labels_and_custom_labels(client):
    a = mk_ledger(client)
    assert (a["gave_label"], a["got_label"]) == ("You gave", "You got")
    b = mk_ledger(client, "Tabs", "custom", gave_label="Lent", got_label="Returned")
    assert (b["gave_label"], b["got_label"]) == ("Lent", "Returned")


def test_duplicate_ledger_name(client):
    mk_ledger(client)
    r = client.post("/api/ledgers", json={"name": "Customers", "kind": "payable"})
    assert r.status_code == 409


def test_receivable_balance_and_running(client):
    led = mk_ledger(client)
    p = mk_party(client, led["id"])
    assert p["phone"] == "9820011122"
    mk_entry(client, led["id"], p["id"], "gave", "1000.50", "2026-10-01")
    mk_entry(client, led["id"], p["id"], "got", "400", "2026-10-02")
    mk_entry(client, led["id"], p["id"], "gave", "250", "2026-10-03")
    party = client.get(f"/api/parties/{p['id']}").json()
    assert party["balance"] == 850.50
    assert party["entry_count"] == 3
    res = client.get("/api/entries", params={"party_id": p["id"]}).json()
    assert [e["running_balance"] for e in res["items"]] == [850.50, 600.50, 1000.50]
    assert res["gave_sum"] == 1250.50 and res["got_sum"] == 400
    assert client.get(f"/api/ledgers/{led['id']}").json()["balance"] == 850.50


def test_payable_balance_is_what_you_owe(client):
    led = mk_ledger(client, "Suppliers", "payable")
    p = mk_party(client, led["id"], "Gupta Dairy")
    mk_entry(client, led["id"], p["id"], "got", "5000")
    mk_entry(client, led["id"], p["id"], "gave", "1500")
    assert client.get(f"/api/parties/{p['id']}").json()["balance"] == 3500


def test_cash_book_has_no_parties(client):
    led = mk_ledger(client, "Cash book", "cash")
    assert client.post(f"/api/ledgers/{led['id']}/parties", json={"name": "x"}).status_code == 422
    mk_entry(client, led["id"], None, "got", "3000")
    mk_entry(client, led["id"], None, "gave", "450")
    assert client.get(f"/api/ledgers/{led['id']}").json()["balance"] == 2550
    items = client.get("/api/entries", params={"ledger_id": led["id"]}).json()["items"]
    assert items[0]["running_balance"] == 2550


def test_entry_validation(client):
    led = mk_ledger(client)
    other = mk_ledger(client, "Suppliers", "payable")
    p = mk_party(client, led["id"])
    base = {"ledger_id": led["id"], "party_id": p["id"], "direction": "gave", "entry_date": "2026-11-01"}
    assert client.post("/api/entries", json={**base, "amount": "0"}).status_code == 422
    assert client.post("/api/entries", json={**base, "amount": "-5"}).status_code == 422
    assert client.post("/api/entries", json={**base, "amount": "10.555"}).status_code == 422
    assert client.post("/api/entries", json={**base, "amount": "10", "party_id": None}).status_code == 422
    assert client.post("/api/entries", json={**base, "amount": "10", "ledger_id": other["id"]}).status_code == 422
    assert client.post("/api/entries", json={**base, "amount": "10", "ledger_id": 999}).status_code == 404


def test_edit_delete_entry_and_cascade(client):
    led = mk_ledger(client)
    p = mk_party(client, led["id"])
    e = mk_entry(client, led["id"], p["id"], "gave", "100")
    r = client.patch(f"/api/entries/{e['id']}", json={"amount": "175", "direction": "got"})
    assert r.status_code == 200 and r.json()["amount"] == 175 and r.json()["direction"] == "got"
    assert client.delete(f"/api/entries/{e['id']}").status_code == 204
    assert client.get(f"/api/parties/{p['id']}").json()["balance"] == 0
    mk_entry(client, led["id"], p["id"], "gave", "100")
    assert client.delete(f"/api/ledgers/{led['id']}").status_code == 204
    assert client.get("/api/entries").json()["total"] == 0


def test_dashboard_numbers(client):
    from datetime import date

    from app import services
    from app.database import SessionLocal

    cust = mk_ledger(client)
    sup = mk_ledger(client, "Suppliers", "payable")
    cash = mk_ledger(client, "Cash book", "cash")
    a, b = mk_party(client, cust["id"], "A"), mk_party(client, cust["id"], "B")
    s = mk_party(client, sup["id"], "S")
    # today is 2026-11-15; last month same span is 2026-10-01..2026-10-15
    mk_entry(client, cust["id"], a["id"], "gave", "1000", "2026-11-10")
    mk_entry(client, cust["id"], a["id"], "got", "300", "2026-11-12")
    mk_entry(client, cust["id"], b["id"], "gave", "500", "2026-11-15")
    mk_entry(client, cust["id"], b["id"], "got", "500", "2026-11-15")  # fully settled: not a debtor
    mk_entry(client, cust["id"], a["id"], "gave", "200", "2026-10-05")  # previous period sale
    mk_entry(client, cust["id"], a["id"], "gave", "900", "2026-10-20")  # after the same-day cut-off
    mk_entry(client, sup["id"], s["id"], "got", "4000", "2026-11-02")
    mk_entry(client, sup["id"], s["id"], "gave", "1000", "2026-11-03")
    mk_entry(client, cash["id"], None, "got", "2500", "2026-11-15")
    mk_entry(client, cash["id"], None, "gave", "700", "2026-11-15")

    with SessionLocal() as db:
        d = services.dashboard(db, today=date(2026, 11, 15))

    # A owes 1000 + 200 + 900 - 300 = 1800; B is settled, so only one debtor.
    assert d["to_receive"] == 1800 and d["debtor_count"] == 1
    assert d["top_debtors"][0]["name"] == "A" and d["top_debtors"][0]["last_payment"] == "2026-11-12"
    assert d["to_pay"] == 3000 and d["creditor_count"] == 1
    assert d["cash_in_hand"] == 1800
    # Sales = credit sales (1000 + 500) + cash in (2500) this month.
    assert d["sales_month"] == 4000
    assert d["sales_today"] == 3000
    # Same span last month (1-15 Oct): only the 200 sale, not the 900 on the 20th.
    assert d["sales_prev_period"] == 200
    assert d["collected_month"] == 800 and d["collected_prev_period"] == 0
    assert len(d["daily_sales"]) == 30
    assert d["daily_sales"][-1] == {"date": "2026-11-15", "amount": 3000}
    assert sum(x["amount"] for x in d["daily_sales"]) == 4000 + 900  # 17 Oct - 15 Nov window
    assert d["counts"] == {"ledgers": 3, "parties": 3, "entries": 10}
    assert d["recent"][0]["entry_date"] == "2026-11-15"


def test_seed_runs_and_reconciles(client):
    from datetime import date

    from app import services
    from app.database import SessionLocal
    from seed import seed

    with SessionLocal() as db:
        seed(db, today=date(2026, 11, 15))
        d = services.dashboard(db, today=date(2026, 11, 15))
    ledgers = client.get("/api/ledgers").json()
    assert {l["name"] for l in ledgers} == {"Customers", "Suppliers", "Cash book", "Staff advances"}
    # Dashboard "to receive" is the sum of positive customer balances; it can never exceed the ledger's gave total.
    customers = next(l for l in ledgers if l["name"] == "Customers")
    parties = client.get(f"/api/ledgers/{customers['id']}/parties").json()
    assert d["to_receive"] == round(sum(p["balance"] for p in parties if p["balance"] > 0), 2)
    assert d["to_receive"] > 0 and d["sales_month"] > 0
