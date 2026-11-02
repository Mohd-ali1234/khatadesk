from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# What a ledger means decides how its entries add up (see services.signed_amount).
#   receivable : customers who buy on credit  (gave = credit sale, got = payment)
#   payable    : suppliers you buy from       (got = credit purchase, gave = payment)
#   cash       : a cash book, no parties      (got = money in, gave = money out)
#   custom     : anything else you name       (got = in, gave = out)
LEDGER_KINDS = ("receivable", "payable", "cash", "custom")
DIRECTIONS = ("gave", "got")


class Ledger(Base):
    __tablename__ = "ledgers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    kind: Mapped[str] = mapped_column(String(16))
    gave_label: Mapped[str] = mapped_column(String(32))
    got_label: Mapped[str] = mapped_column(String(32))
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    parties: Mapped[list["Party"]] = relationship(
        back_populates="ledger", cascade="all, delete-orphan"
    )
    entries: Mapped[list["Entry"]] = relationship(
        back_populates="ledger", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("kind in ('receivable','payable','cash','custom')", name="ck_ledger_kind"),
    )


class Party(Base):
    __tablename__ = "parties"

    id: Mapped[int] = mapped_column(primary_key=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), default="")
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    ledger: Mapped[Ledger] = relationship(back_populates="parties")
    entries: Mapped[list["Entry"]] = relationship(
        back_populates="party", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_party_ledger_name", "ledger_id", "name"),)


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id", ondelete="CASCADE"))
    # Null for cash-book style ledgers, which have no parties.
    party_id: Mapped[int | None] = mapped_column(
        ForeignKey("parties.id", ondelete="CASCADE"), nullable=True
    )
    direction: Mapped[str] = mapped_column(String(4))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    entry_date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    ledger: Mapped[Ledger] = relationship(back_populates="entries")
    party: Mapped[Party | None] = relationship(back_populates="entries")

    __table_args__ = (
        CheckConstraint("direction in ('gave','got')", name="ck_entry_direction"),
        CheckConstraint("amount > 0", name="ck_entry_amount_positive"),
        Index("ix_entry_ledger_date", "ledger_id", "entry_date"),
        Index("ix_entry_party_date", "party_id", "entry_date"),
    )
