"""add fullscreen_exit event type

Revision ID: e1f0a2b3c4d5
Revises: d6a7c7dbc837
Create Date: 2025-08-14
"""
from alembic import op

revision = "e1f0a2b3c4d5"
down_revision = "d6a7c7dbc837"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'fullscreen_exit'")


def downgrade() -> None:
    pass