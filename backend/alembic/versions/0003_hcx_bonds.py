"""HCX names are corporate bonds

Revision ID: 0003_hcx_bonds
Revises: 0002_bar_sync
Create Date: 2026-09-28
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0003_hcx_bonds"
down_revision: Union[str, Sequence[str], None] = "0002_bar_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE symbol SET type = 'bond' WHERE board = 'HCX'")


def downgrade() -> None:
    op.execute("UPDATE symbol SET type = 'stock' WHERE board = 'HCX' AND type = 'bond'")
