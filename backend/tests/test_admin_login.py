import json

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.admin_credentials import password_hash, verify_password
from app.config import Settings
from app.models import User
from test_api import KEY, ONE, TWO, assert_private, assertion, call, client

OPERATOR = "a" * 32
PASSWORD = "synthetic-operator-password-for-tests-only"


@pytest.fixture
def operator(client):
    settings = client[0].app.state.settings
    settings.admin_login_username = "forum_admin"
    settings.admin_login_account_id = OPERATOR
    from pydantic import SecretStr
    settings.admin_login_password_hash = SecretStr(password_hash(PASSWORD, b"0" * 16))
    settings.admin_anon_ids += "," + OPERATOR
    return client


def login(client, data=None, viewer=OPERATOR, scope="admin-login"):
    data = data or {"username": "forum_admin", "password": PASSWORD}
    body = json.dumps(data, separators=(",", ":"))
    token = assertion(viewer, "POST", "/internal/admin-login", body, scope=scope)
    return call(client, "POST", "/internal/admin-login", data, viewer=viewer, token=token)


def test_operator_login_creates_only_synthetic_account_and_returns_username(operator):
    with Session(operator[1]) as db:
        assert db.get(User, OPERATOR) is None
    response = login(operator)
    assert response.status_code == 200 and response.json() == {"username": "forum_admin"}
    assert_private(response.json())
    assert OPERATOR not in response.text and PASSWORD not in response.text
    assert login(operator).status_code == 200
    assert call(operator, "GET", "/api/admin/overview", viewer=OPERATOR).status_code == 200
    assert call(operator, "GET", "/internal/session", viewer=OPERATOR).json() == {"username": "forum_admin"}


def test_credentials_are_private_strict_and_cannot_choose_subject(operator):
    assert operator[0].post("/internal/admin-login", json={"username": "forum_admin", "password": PASSWORD}).status_code == 401
    assert login(operator, scope="forum").status_code == 401
    assert login(operator, viewer=TWO).status_code == 401
    assert login(operator, {"username": "wrong_user", "password": PASSWORD}).json() == {"error": "Invalid credentials"}
    assert login(operator, {"username": "forum_admin", "password": "wrong"}).json() == {"error": "Invalid credentials"}
    assert login(operator, {"username": "forum_admin", "password": PASSWORD, "userId": ONE}).status_code == 400
    with Session(operator[1]) as db:
        assert db.get(User, OPERATOR) is None


def test_operator_login_fails_when_disabled_not_allowlisted_or_suspended(operator):
    settings = operator[0].app.state.settings
    settings.admin_anon_ids = ONE
    assert login(operator).status_code == 401
    settings.admin_anon_ids += "," + OPERATOR
    with Session(operator[1]) as db, db.begin():
        db.add(User(id=OPERATOR, username="forum_admin", username_lower="forum_admin", suspended=True))
    assert login(operator).status_code == 401
    settings.admin_login_account_id = ""
    assert login(operator).status_code == 401


def test_operator_cannot_take_existing_username(operator):
    operator[0].app.state.settings.admin_login_username = "campusowl"
    assert login(operator, {"username": "campusowl", "password": PASSWORD}).status_code == 409
    with Session(operator[1]) as db:
        assert db.get(User, OPERATOR) is None
        assert db.get(User, TWO).username == "campusowl"


def test_failed_attempts_share_bounded_operator_budget(operator):
    for index in range(5):
        assert login(operator, {"username": f"wrong_{index}", "password": "incorrect"}).status_code == 401
    response = login(operator)
    assert response.status_code == 429 and int(response.headers["retry-after"]) > 0


def test_password_hash_and_complete_private_configuration():
    encoded = password_hash(PASSWORD, b"1" * 16)
    assert verify_password(PASSWORD, encoded)
    assert not verify_password("wrong", encoded)
    assert not verify_password(PASSWORD, "invalid")
    assert not verify_password("x" * 1025, encoded)
    config = dict(app_env="test", database_url="sqlite://", backend_shared_secret=KEY,
                  admin_anon_ids=OPERATOR, admin_login_account_id=OPERATOR,
                  admin_login_username="forum_admin", admin_login_password_hash=encoded)
    assert Settings(**config).is_admin(OPERATOR)
    for override in [{"admin_anon_ids": ""}, {"admin_login_password_hash": "plaintext-sensitive-synthetic"},
                     {"admin_login_account_id": ""}, {"admin_login_username": "bad@name"}]:
        with pytest.raises(ValidationError) as error:
            Settings(**(config | override))
        assert "plaintext-sensitive-synthetic" not in str(error.value)
        assert PASSWORD not in str(error.value)
