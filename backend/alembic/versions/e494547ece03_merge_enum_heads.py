"""merge enum heads

Revision ID: e494547ece03
Revises: 3f0b2a1c9e44, e1f0a2b3c4d5
Create Date: 2026-08-15 14:04:11.475268

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e494547ece03'
down_revision: Union[str, Sequence[str], None] = ('3f0b2a1c9e44', 'e1f0a2b3c4d5')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
