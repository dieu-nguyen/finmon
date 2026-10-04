"""named pattern swing points on scan hits

Revision ID: 0005_named_pattern_hits
Revises: 0004_pattern_tables
Create Date: 2026-10-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_named_pattern_hits"
down_revision: Union[str, Sequence[str], None] = "0004_pattern_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scan_hit", sa.Column("swings", sa.JSON(), nullable=True))
    op.add_column("scan_hit", sa.Column("state", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("scan_hit", "state")
    op.drop_column("scan_hit", "swings")
