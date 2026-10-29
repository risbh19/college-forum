"""Add reversible account suspension, preserving existing records and identities."""
from alembic import op
import sqlalchemy as sa

revision = "0003_admin_accounts"
down_revision = "0002_reports"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("User", sa.Column("suspended", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    raise RuntimeError("Suspension state must be preserved. Restore a reviewed backup instead.")
