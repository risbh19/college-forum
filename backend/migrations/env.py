from alembic import context
from pathlib import Path
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool

from app.config import Settings, postgres_connect_args, sqlalchemy_url
from app.models import Base

if not os.environ.get('DATABASE_URL'):
    load_dotenv(Path(__file__).resolve().parents[2] / '.env', override=False)
settings = Settings()
raw_url = settings.direct_url.get_secret_value() if settings.direct_url and settings.direct_url.get_secret_value() else settings.database_url.get_secret_value()
url = sqlalchemy_url(raw_url)
options = {"hide_parameters": True, "poolclass": pool.NullPool}
if raw_url.startswith(('postgres:', 'postgresql:')):
    options["connect_args"] = postgres_connect_args(settings, raw_url)
engine = create_engine(url, **options)
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
