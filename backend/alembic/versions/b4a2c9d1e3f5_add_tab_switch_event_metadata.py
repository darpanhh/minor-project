"""add tab-switch event metadata columns

Revision ID: b4a2c9d1e3f5
Revises: a1b2c3d4e5f6
Create Date: 2026-08-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4a2c9d1e3f5"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proctoring_events", sa.Column("occurrence", sa.Integer(), nullable=True))
    op.add_column("proctoring_events", sa.Column("duration", sa.Float(), nullable=True))
    op.add_column("proctoring_events", sa.Column("action", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("proctoring_events", "action")
    op.drop_column("proctoring_events", "duration")
    op.drop_column("proctoring_events", "occurrence")