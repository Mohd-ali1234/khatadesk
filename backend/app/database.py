import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# MySQL by default. Override with DATABASE_URL (tests use SQLite).
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://khata:khata@127.0.0.1:3306/khata?charset=utf8mb4",
)

_kwargs = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    _kwargs = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in DATABASE_URL:
        from sqlalchemy.pool import StaticPool

        _kwargs["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
