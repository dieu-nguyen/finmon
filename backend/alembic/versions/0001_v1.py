"""v1 tables

Revision ID: 0001_v1
Revises:
Create Date: 2026-09-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_v1"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "symbol",
        sa.Column("ticker", sa.String(32), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("board", sa.String(16), nullable=False, server_default=""),
        sa.Column("type", sa.String(16), nullable=False, server_default="stock"),
        sa.Column("listed", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "daily_bar",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticker", sa.String(32), nullable=False, index=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("open", sa.BigInteger(), nullable=False),
        sa.Column("high", sa.BigInteger(), nullable=False),
        sa.Column("low", sa.BigInteger(), nullable=False),
        sa.Column("close", sa.BigInteger(), nullable=False),
        sa.Column("volume", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("value", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(16), nullable=False, server_default="dnse"),
        sa.UniqueConstraint("ticker", "date", name="uq_daily_bar_ticker_date"),
    )
    op.create_table(
        "quote_snapshot",
        sa.Column("ticker", sa.String(32), primary_key=True),
        sa.Column("last", sa.BigInteger(), nullable=False),
        sa.Column("ref", sa.BigInteger(), nullable=True),
        sa.Column("ceiling", sa.BigInteger(), nullable=True),
        sa.Column("floor", sa.BigInteger(), nullable=True),
        sa.Column("time", sa.DateTime(), nullable=True),
        sa.Column("source", sa.String(16), nullable=False, server_default="dnse"),
    )
    op.create_table(
        "watchlist_item",
        sa.Column("ticker", sa.String(32), primary_key=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "drawing",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticker", sa.String(32), nullable=False, index=True),
        sa.Column("tool", sa.String(32), nullable=False),
        sa.Column("points", sa.JSON(), nullable=True),
        sa.Column("style", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "chart_note",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticker", sa.String(32), nullable=False, index=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
    )
    op.create_table(
        "page_note",
        sa.Column("ticker", sa.String(32), primary_key=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "page_note_revision",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticker", sa.String(32), nullable=False, index=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "price_alert",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticker", sa.String(32), nullable=False, index=True),
        sa.Column("op", sa.String(8), nullable=False),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("mode", sa.String(8), nullable=False, server_default="once"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_fired_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "alert_delivery",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("alert_id", sa.Integer(), sa.ForeignKey("price_alert.id"), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.Column("telegram_ok", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payload", sa.Text(), nullable=False),
    )
    op.create_table(
        "ingest_watermark",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("job", sa.String(32), nullable=False),
        sa.Column("as_of", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="ok"),
        sa.Column("message", sa.Text(), nullable=False),
    )
    op.create_table(
        "company_cache",
        sa.Column("ticker", sa.String(32), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    for name in [
        "company_cache",
        "ingest_watermark",
        "alert_delivery",
        "price_alert",
        "page_note_revision",
        "page_note",
        "chart_note",
        "drawing",
        "watchlist_item",
        "quote_snapshot",
        "daily_bar",
        "symbol",
    ]:
        op.drop_table(name)
