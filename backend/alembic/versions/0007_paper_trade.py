"""paper trading account, positions, and fills

Revision ID: 0007_paper_trade
Revises: 0006_named_scan_request
Create Date: 2026-11-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_paper_trade"
down_revision: Union[str, Sequence[str], None] = "0006_named_scan_request"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "paper_account",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cash", sa.BigInteger(), nullable=False),
        sa.Column("starting_cash", sa.BigInteger(), nullable=False),
    )
    op.create_table(
        "paper_position",
        sa.Column("ticker", sa.String(32), primary_key=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("cost_basis", sa.BigInteger(), nullable=False),
    )
    op.create_table(
        "paper_fill",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticker", sa.String(32), nullable=False, index=True),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("realized_pnl", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("cash_after", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("paper_fill")
    op.drop_table("paper_position")
    op.drop_table("paper_account")
