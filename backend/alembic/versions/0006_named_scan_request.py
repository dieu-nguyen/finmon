"""record the patterns and ticker scope on a named scan run

Revision ID: 0006_named_scan_request
Revises: 0005_named_pattern_hits
Create Date: 2026-10-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_named_scan_request"
down_revision: Union[str, Sequence[str], None] = "0005_named_pattern_hits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scan_run", sa.Column("request", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("scan_run", "request")
