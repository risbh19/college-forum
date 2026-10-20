from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session

from app.config import Settings, postgres_connect_args
from app.models import Comment, Post, User, Vote


def test_baseline_adopts_existing_data_and_is_repeatable(tmp_path, monkeypatch):
    url = 'sqlite:///' + (tmp_path / 'forum.db').as_posix()
    engine = create_engine(url)
    for table in [User.__table__, Post.__table__, Comment.__table__, Vote.__table__]:
        table.create(engine)
    with Session(engine) as db, db.begin():
        db.add(User(id='a' * 32, username='existing_alias', username_lower='existing_alias'))
    monkeypatch.setenv('APP_ENV', 'test')
    monkeypatch.setenv('DATABASE_URL', url)
    monkeypatch.setenv('DIRECT_URL', '')
    monkeypatch.setenv('BACKEND_SHARED_SECRET', 'synthetic-migration-service-secret-123456')
    monkeypatch.setenv('BACKEND_URL', 'http://127.0.0.1:8000')
    monkeypatch.setenv('COLLEGE_FORUM_LOCAL', '0')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, 'head')
    command.upgrade(config, 'head')
    with Session(engine) as db:
        assert db.scalar(select(User.username)) == 'existing_alias'
    assert {'RateBucket', 'UsedAssertion', 'alembic_version'} <= set(inspect(engine).get_table_names())
    engine.dispose()


def test_production_database_certificate_and_hostname_are_verified():
    settings = Settings(app_env='production', database_url='postgresql://test:test@db.example/forum', backend_shared_secret='synthetic-migration-service-secret-123456')
    options = postgres_connect_args(settings, settings.database_url.get_secret_value())
    assert options['sslmode'] == 'verify-full' and Path(options['sslrootcert']).is_file()
    configured = postgres_connect_args(settings, 'postgresql://test:test@db.example/forum?sslmode=disable&sslrootcert=/cert/provider.pem')
    assert configured['sslmode'] == 'verify-full' and configured['sslrootcert'] == '/cert/provider.pem'
