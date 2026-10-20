"""Add private reports and content visibility without altering existing identities."""
from alembic import op
import sqlalchemy as sa

revision = "0002_reports"
down_revision = "0001_fastapi_baseline"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("Post", sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("Comment", sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "Report",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("postId", sa.String(), sa.ForeignKey("Post.id", ondelete="CASCADE")),
        sa.Column("commentId", sa.String(), sa.ForeignKey("Comment.id", ondelete="CASCADE")),
        sa.Column("reporterId", sa.String(), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.CheckConstraint('("postId" IS NOT NULL AND "commentId" IS NULL) OR ("postId" IS NULL AND "commentId" IS NOT NULL)', name="Report_one_target"),
        sa.UniqueConstraint("postId", "reporterId", name="Report_post_reporter_key"),
        sa.UniqueConstraint("commentId", "reporterId", name="Report_comment_reporter_key"),
    )
    op.create_index("Report_createdAt_idx", "Report", ["createdAt"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute('ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY')


def downgrade():
    raise RuntimeError("Reports contain moderation history. Restore a reviewed backup instead.")
