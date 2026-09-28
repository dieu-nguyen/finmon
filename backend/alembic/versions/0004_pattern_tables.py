"""pattern compare tables

Revision ID: 0004_pattern_tables
Revises: 0003_hcx_bonds
Create Date: 2026-09-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_pattern_tables"
down_revision: Union[str, Sequence[str], None] = "0003_hcx_bonds"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pattern_def",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False, server_default="lookalike"),
        sa.Column("spec", sa.JSON(), nullable=False),
        sa.Column("schedule", sa.String(16), nullable=False, server_default="daily"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "scan_run",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("pattern_id", sa.Integer(), sa.ForeignKey("pattern_def.id"), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("eligible_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("compared_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("reference_compared", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_scan_run_pattern_id", "scan_run", ["pattern_id"])
    op.create_table(
        "scan_hit",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("scan_run.id"), nullable=False),
        sa.Column("pattern_id", sa.Integer(), sa.ForeignKey("pattern_def.id"), nullable=False),
        sa.Column("ticker", sa.String(32), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("window_start", sa.Date(), nullable=False),
        sa.Column("window_end", sa.Date(), nullable=False),
    )
    op.create_index("ix_scan_hit_run_id", "scan_hit", ["run_id"])
    op.create_index("ix_scan_hit_pattern_id", "scan_hit", ["pattern_id"])


def downgrade() -> None:
    op.drop_index("ix_scan_hit_pattern_id", table_name="scan_hit")
    op.drop_index("ix_scan_hit_run_id", table_name="scan_hit")
    op.drop_table("scan_hit")
    op.drop_index("ix_scan_run_pattern_id", table_name="scan_run")
    op.drop_table("scan_run")
    op.drop_table("pattern_def")
