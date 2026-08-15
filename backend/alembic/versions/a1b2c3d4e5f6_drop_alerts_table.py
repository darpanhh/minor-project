"""drop alerts table (suspicion engine removed)

Revision ID: a1b2c3d4e5f6
Revises: e494547ece03
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "e494547ece03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("alerts")


def downgrade() -> None:
    op.create_table(
        "alerts",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("suspicion_score", sa.Float(), nullable=False),
        sa.Column("severity", sa.Enum("low", "medium", "high", name="severity"), nullable=False),
        sa.Column("reviewed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["exam_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )