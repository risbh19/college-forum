import hashlib
import json
import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.main import create_app
from app.models import Base, Comment, Post, RateBucket, User, Vote, utcnow

KEY = "synthetic-backend-test-key-never-for-production-123456"
ONE, TWO, NEW = "1" * 32, "2" * 32, "3" * 32


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool, hide_parameters=True)
    event.listen(engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    settings = Settings(app_env="test", database_url="sqlite://", backend_shared_secret=KEY)
    with Session(engine) as db, db.begin():
        db.add_all([User(id=ONE, username="shadowcoder42", username_lower="shadowcoder42"), User(id=TWO, username="campusowl", username_lower="campusowl")])
    with TestClient(create_app(settings, engine), raise_server_exceptions=False) as browser:
        yield browser, engine
    engine.dispose()


def assertion(viewer, request_method, request_path, body="", **overrides):
    now = int(time.time())
    claims = {"sub": viewer, "scope": "identity" if request_path == "/internal/session" else "forum", "method": request_method,
              "path": request_path, "bodyHash": hashlib.sha256(body.encode()).hexdigest(), "iat": now, "nbf": now,
              "exp": now + 20, "jti": str(uuid.uuid4()), "iss": "college-forum-web", "aud": "college-forum-api"}
    claims.update(overrides)
    return jwt.encode(claims, KEY, algorithm="HS256")


def call(client, method, path, data=None, viewer=ONE, token=None, raw=None):
    body = raw if raw is not None else json.dumps(data, separators=(",", ":")) if data is not None else ""
    headers = {"authorization": "Bearer " + (token or assertion(viewer, method, path.split("?")[0], body))}
    if method == "POST":
        headers["content-type"] = "application/json"
    return client[0].request(method, path, content=body, headers=headers)


def new_post(client):
    response = call(client, "POST", "/api/posts", {"title": "Test post", "body": "Hello campus", "board": "general"})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def assert_private(value):
    if isinstance(value, dict):
        assert not set(value) & {"userId", "anonId", "email", "name", "picture", "image", "sub"}
        for nested in value.values():
            assert_private(nested)
    elif isinstance(value, list):
        for nested in value:
            assert_private(nested)
    elif isinstance(value, str):
        assert value not in {ONE, TWO, NEW}


def test_unsigned_requests_fail_closed(client):
    assert client[0].get("/api/posts").status_code == 401
    assert client[0].get("/internal/session").status_code == 401
    assert client[0].get("/health").json() == {"status": "ok"}


def test_readiness_requires_migrated_database_and_expected_schema(client):
    assert client[0].get('/ready').status_code == 503
    with client[1].begin() as db:
        db.execute(text('CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)'))
        db.execute(text("INSERT INTO alembic_version VALUES ('0001_fastapi_baseline')"))
    assert client[0].get('/ready').json() == {'status': 'ready'}
    with client[1].begin() as db:
        db.execute(text("UPDATE alembic_version SET version_num = 'old-revision'"))
    result = client[0].get('/ready')
    assert result.status_code == 503 and result.json() == {'error': 'Service temporarily unavailable'}


@pytest.mark.parametrize("overrides", [
    {"iss": "attacker"}, {"aud": "other-service"}, {"sub": "not-an-anonymous-id"},
    {"scope": "identity"}, {"method": "DELETE"}, {"path": "/api/votes"},
    {"bodyHash": "0" * 64}, {"email": "synthetic@example.invalid"},
    {"exp": int(time.time()) - 10}, {"exp": int(time.time()) + 3600},
    {"iat": "invalid"}, {"jti": "invalid"},
])
def test_assertion_claims_are_enforced(client, overrides):
    token = assertion(ONE, "GET", "/api/posts", **overrides)
    assert call(client, "GET", "/api/posts", token=token).status_code == 401


def test_wrong_signature_and_algorithms_rejected(client):
    good = assertion(ONE, "GET", "/api/posts")
    claims = jwt.decode(good, options={"verify_signature": False})
    for token in [jwt.encode(claims, KEY + "wrong", algorithm="HS256"), jwt.encode(claims, "", algorithm="none")]:
        assert call(client, "GET", "/api/posts", token=token).status_code == 401


def test_mutation_replay_is_rejected(client):
    data = {"title": "Test post", "body": "Hello campus", "board": "general"}
    body = json.dumps(data, separators=(",", ":"))
    token = assertion(ONE, "POST", "/api/posts", body)
    assert call(client, "POST", "/api/posts", data, token=token).status_code == 201
    assert call(client, "POST", "/api/posts", data, token=token).status_code == 401


def test_identity_endpoint_returns_username_only(client):
    assert call(client, "GET", "/internal/session").json() == {"username": "shadowcoder42"}
    assert call(client, "GET", "/internal/session", viewer=NEW).json() == {"username": None}
    assert call(client, "GET", "/api/posts", viewer=NEW).status_code == 403


@pytest.mark.parametrize("name", ["admin", "MOD", "ab", "wrong-name", "a" * 21])
def test_username_validation(client, name):
    assert call(client, "POST", "/api/username", {"username": name}, viewer=NEW).status_code == 400


def test_username_uniqueness_and_immutability(client):
    assert call(client, "POST", "/api/username", {"username": "SHADOWCODER42"}, viewer=NEW).status_code == 409
    assert call(client, "POST", "/api/username", {"username": "new_alias"}, viewer=NEW).status_code == 200
    assert call(client, "POST", "/api/username", {"username": "other_alias"}, viewer=NEW).status_code == 409


def test_two_accounts_post_comment_vote_and_ownership(client):
    ident = new_post(client)
    other = call(client, "GET", f"/api/posts/{ident}", viewer=TWO).json()
    assert other["isMine"] is False
    assert_private(other)
    assert call(client, "DELETE", f"/api/posts/{ident}", viewer=TWO).status_code == 403
    comment = call(client, "POST", "/api/comments", {"postId": ident, "body": "Good discussion"}, viewer=TWO)
    assert comment.status_code == 201
    assert_private(comment.json())
    for kind, score, mine in [("UP", 1, "UP"), ("UP", 0, None), ("DOWN", -1, "DOWN"), ("UP", 1, "UP")]:
        response = call(client, "POST", "/api/votes", {"postId": ident, "type": kind}, viewer=TWO)
        assert response.json() == {"score": score, "myVote": mine}
    assert call(client, "GET", f"/api/posts/{ident}").json()["commentCount"] == 1
    assert call(client, "DELETE", f"/api/posts/{ident}").status_code == 200
    assert call(client, "GET", f"/api/posts/{ident}").status_code == 404
    with Session(client[1]) as db:
        assert db.scalar(select(func.count()).select_from(Comment)) == 0
        assert db.scalar(select(func.count()).select_from(Vote)) == 0


def test_failed_commit_returns_error_before_success_is_sent(client):
    def remember_post(session, flush_context, instances):
        if any(isinstance(row, Post) for row in session.new):
            session.info['fail_commit'] = True

    def fail_commit(session):
        if session.info.get('fail_commit'):
            raise SQLAlchemyError('Synthetic commit failure')

    event.listen(Session, 'before_flush', remember_post)
    event.listen(Session, 'before_commit', fail_commit)
    try:
        response = call(client, 'POST', '/api/posts', {'title': 'Commit check', 'body': 'Temporary test', 'board': 'general'})
        assert response.status_code == 503
        assert response.json() == {'error': 'Service temporarily unavailable'}
        with Session(client[1]) as db:
            assert db.scalar(select(func.count()).select_from(Post)) == 0
    finally:
        event.remove(Session, 'before_flush', remember_post)
        event.remove(Session, 'before_commit', fail_commit)


@pytest.mark.parametrize("data", [
    {"title": "ok", "body": "", "board": "general"},
    {"title": "Valid title", "body": "Content", "board": "unknown"},
    {"title": "Valid title", "body": "Content", "board": "general", "userId": TWO},
    {"title": 123, "body": "Content", "board": "general"},
    {"title": "Valid title", "body": " " * 10, "board": "general"},
])
def test_strict_payload_validation(client, data):
    assert call(client, "POST", "/api/posts", data).status_code == 400


def test_bounded_requests_and_safe_errors(client):
    assert call(client, "POST", "/api/posts", raw="{" ).status_code == 400
    assert call(client, "POST", "/api/posts", raw="x" * 65537).status_code == 413
    assert call(client, "GET", "/api/posts", raw="x" * 65537).status_code == 413
    assert call(client, "DELETE", "/api/posts/missing", raw="x" * 65537).status_code == 413
    assert client[0].post("/api/posts", content="{}").status_code == 415
    assert call(client, "GET", "/api/posts?cursor=" + "a" * 3000).status_code == 414
    assert call(client, "GET", "/api/posts?board=invalid").status_code == 400
    assert "input" not in call(client, "POST", "/api/posts", raw="{" ).json()


def test_pagination_and_expired_cursor(client):
    with Session(client[1]) as db, db.begin():
        for index in range(22):
            db.add(Post(id=f"page-{index:03}", title="Page test", body="Sample", board="hostel", user_id=ONE, created_at=utcnow()))
    first = call(client, "GET", "/api/posts?board=hostel").json()
    assert len(first["posts"]) == 20
    second = call(client, "GET", f"/api/posts?board=hostel&cursor={first['nextCursor']}").json()
    assert len(second["posts"]) == 2 and second["nextCursor"] is None
    assert len({row["id"] for row in first["posts"] + second["posts"]}) == 22
    assert call(client, "GET", f"/api/posts?board=cse&cursor={first['nextCursor']}").status_code == 400
    assert call(client, "DELETE", f"/api/posts/{first['nextCursor']}").status_code == 200
    assert call(client, "GET", f"/api/posts?cursor={first['nextCursor']}").status_code == 400


def test_rate_limit_is_shared_database_state(client):
    for _ in range(10):
        new_post(client)
    response = call(client, "POST", "/api/posts", {"title": "Rate test", "body": "Sample", "board": "general"})
    assert response.status_code == 429 and response.headers["retry-after"].isdigit()
    with Session(client[1]) as db, db.begin():
        for row in db.scalars(select(RateBucket)):
            row.window -= 1
    assert call(client, "POST", "/api/posts", {"title": "Rate reset", "body": "Sample", "board": "general"}).status_code == 201


def test_security_headers_and_production_docs(client):
    response = call(client, "GET", "/api/posts")
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    settings = Settings(app_env="production", database_url="postgresql://test:test@localhost/test", backend_shared_secret=KEY, backend_url="https://api.example.invalid")
    with TestClient(create_app(settings, client[1])) as production:
        assert production.get("/docs", headers={"host": "api.example.invalid"}).status_code == 404
        assert production.get("/openapi.json", headers={"host": "api.example.invalid"}).status_code == 404
        assert production.get("/health", headers={"host": "attacker.invalid"}).status_code == 400


def test_invalid_production_and_local_settings_fail_closed():
    with pytest.raises(ValueError):
        Settings(app_env="production", database_url="sqlite://", backend_shared_secret=KEY)
    with pytest.raises(ValueError):
        Settings(app_env="production", database_url="postgresql://test:test@localhost/college_forum_local", backend_shared_secret=KEY, college_forum_local=True)
    with pytest.raises(ValueError):
        Settings(app_env="test", database_url="sqlite://", backend_shared_secret="short")
