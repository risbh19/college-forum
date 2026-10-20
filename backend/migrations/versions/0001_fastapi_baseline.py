"""Adopt existing forum tables and add shared security state without deleting data."""
from alembic import op
from migrations.schema_v1 import Base

revision = "0001_fastapi_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)
    if bind.dialect.name == "postgresql":
        for name in ("User", "Post", "Comment", "Vote", "RateBucket", "UsedAssertion"):
            op.execute(f'ALTER TABLE "{name}" ENABLE ROW LEVEL SECURITY')


def downgrade():
    raise RuntimeError("This baseline adopts existing data. Restore from a reviewed backup instead of dropping forum tables.")
