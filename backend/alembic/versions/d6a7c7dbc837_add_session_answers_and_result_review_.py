"""add session answers and result review fields

Revision ID: d6a7c7dbc837
Revises: 5fe9ed86e6c3
Create Date: 2026-08-10 21:51:06.456896

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd6a7c7dbc837'
down_revision: Union[str, Sequence[str], None] = '5fe9ed86e6c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    resultstatus = postgresql.ENUM('pending', 'reviewed', name='resultstatus', create_type=True)
    resultstatus.create(op.get_bind(), checkfirst=True)
    op.add_column('exam_sessions', sa.Column('answers', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False))
    op.add_column('exam_sessions', sa.Column('result_status', resultstatus, server_default='pending', nullable=False))
    op.add_column('exam_sessions', sa.Column('final_score', sa.Float(), nullable=True))
    op.add_column('exam_sessions', sa.Column('admin_notes', sa.Text(), nullable=True))
    op.add_column('exam_sessions', sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('exam_sessions', 'reviewed_at')
    op.drop_column('exam_sessions', 'admin_notes')
    op.drop_column('exam_sessions', 'final_score')
    op.drop_column('exam_sessions', 'result_status')
    op.drop_column('exam_sessions', 'answers')
    resultstatus = postgresql.ENUM('pending', 'reviewed', name='resultstatus')
    resultstatus.drop(op.get_bind(), checkfirst=True)
    # ### end Alembic commands ###
