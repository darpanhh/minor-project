"""add phone_detected and person_absent to eventtype enum

Revision ID: 3f0b2a1c9e44
Revises: d6a7c7dbc837
Create Date: 2026-08-11 22:25:00.000000

The proctoring pipeline maps phone/multiple/person-absent detections to
EventType values, but the eventtype enum in the DB was created (in the initial
migration) with only the historical 6 values. phone_detected / person_absent
inserts therefore failed at the DB layer, leaving snapshots on disk with no
ProctoringEvent row (so they never appeared in the admin report).

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3f0b2a1c9e44'
down_revision: Union[str, Sequence[str], None] = 'd6a7c7dbc837'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # PostgreSQL 12+ allows ADD VALUE in a transaction; older versions need
    # autocommit. ADD VALUE IF NOT EXISTS keeps this idempotent.
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'phone_detected'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'person_absent'")


def downgrade() -> None:
    """Downgrade schema.

    PostgreSQL cannot remove enum values. Records already using these values
    must be cleaned up first.
    """
    op.execute("DELETE FROM proctoring_events WHERE event_type IN ('phone_detected', 'person_absent')")
    # NOTE: enum value removal is unsupported by PostgreSQL; leaving the values
    # in the enum is the only safe downgrade option.
