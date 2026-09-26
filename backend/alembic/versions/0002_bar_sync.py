"""bar_sync cursor for history backfill

Revision ID: 0002_bar_sync
Revises: 0001_v1
Create Date: 2026-09-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_bar_sync"
down_revision: Union[str, Sequence[str], None] = "0001_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bar_sync",
        sa.Column("ticker", sa.String(32), primary_key=True),
        sa.Column("oldest_date", sa.Date(), nullable=True),
        sa.Column("newest_date", sa.Date(), nullable=True),
        sa.Column("history_floor", sa.Date(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("last_error", sa.String(512), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("bar_sync")
