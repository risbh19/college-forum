import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models import Comment, Post, Report, User, Vote
from test_api import ONE, TWO, NEW, assert_private, call, client, new_post

FOUR, FIVE = "4" * 32, "5" * 32


def reporters(client):
    with Session(client[1]) as db, db.begin():
        db.add_all([User(id=value, username=f"reporter_{index}", username_lower=f"reporter_{index}")
                    for index, value in enumerate([NEW, FOUR, FIVE])])
    return [TWO, NEW, FOUR]


def test_distinct_post_reports_hide_every_public_path(client):
    identities = reporters(client)
    post_id = new_post(client)
    body = {"postId": post_id, "reason": "Harassment or bullying"}
    for _ in range(3):
        response = call(client, "POST", "/api/reports", body, viewer=TWO)
        assert response.json() == {"success": True}
        assert_private(response.json())
    with Session(client[1]) as db:
        assert db.scalar(select(func.count()).select_from(Report)) == 1
    assert call(client, "GET", f"/api/posts/{post_id}").status_code == 200
    for viewer in identities[1:]:
        assert call(client, "POST", "/api/reports", body, viewer=viewer).status_code == 200
    assert call(client, "GET", "/api/posts").json()["posts"] == []
    for method, path, data in [
        ("GET", f"/api/posts/{post_id}", None),
        ("GET", f"/api/comments?postId={post_id}", None),
        ("POST", "/api/comments", {"postId": post_id, "body": "Hidden parent"}),
        ("POST", "/api/votes", {"postId": post_id, "type": "UP"}),
        ("POST", "/api/reports", body),
    ]:
        result = call(client, method, path, data, viewer=FIVE)
        assert result.status_code == 404
        assert_private(result.json())
    assert call(client, "GET", f"/api/posts?cursor={post_id}").status_code == 400
    # Author deletion remains permitted for hidden content, but no other member.
    assert call(client, "DELETE", f"/api/posts/{post_id}", viewer=FIVE).status_code == 403
    assert call(client, "DELETE", f"/api/posts/{post_id}").status_code == 200
    with Session(client[1]) as db:
        assert db.scalar(select(func.count()).select_from(Report)) == 0


def test_distinct_comment_reports_hide_comment_and_count_only(client):
    reporters(client)
    post_id = new_post(client)
    comment_id = call(client, "POST", "/api/comments", {"postId": post_id, "body": "Comment content"}, viewer=TWO).json()["id"]
    for viewer in [ONE, NEW]:
        assert call(client, "POST", "/api/reports", {"commentId": comment_id, "reason": "Spam content"}, viewer=viewer).status_code == 200
    assert len(call(client, "GET", f"/api/comments?postId={post_id}").json()["comments"]) == 1
    assert call(client, "POST", "/api/reports", {"commentId": comment_id, "reason": "Harmful content"}, viewer=FOUR).status_code == 200
    assert call(client, "GET", f"/api/comments?postId={post_id}").json() == {"comments": []}
    post = call(client, "GET", f"/api/posts/{post_id}")
    assert post.status_code == 200 and post.json()["commentCount"] == 0
    queue = call(client, "GET", "/api/admin/reports")
    assert queue.json()["items"][0]["hidden"] is True
    assert queue.json()["items"][0]["reportCount"] == 3
    assert_private(queue.json())


@pytest.mark.parametrize("body", [
    {"reason": "Spam"}, {"postId": "one", "commentId": "two", "reason": "Spam"},
    {"postId": "one", "reason": " "}, {"postId": "one", "reason": "a" * 501},
    {"postId": "one", "reason": "Spam", "reporterId": ONE},
    {"postId": "one", "reason": "Spam", "userId": ONE},
])
def test_reports_validate_one_target_reason_and_reject_spoofed_identity(client, body):
    response = call(client, "POST", "/api/reports", body, viewer=TWO)
    assert response.status_code == 400
    assert response.json() == {"error": "Invalid input"}


def test_reports_require_membership_existing_target_and_not_own_content(client):
    post_id = new_post(client)
    assert call(client, "POST", "/api/reports", {"postId": post_id, "reason": "Spam"}, viewer=NEW).status_code == 403
    assert call(client, "POST", "/api/reports", {"postId": post_id, "reason": "Spam"}).status_code == 403
    for target in ["postId", "commentId"]:
        assert call(client, "POST", "/api/reports", {target: "missing", "reason": "Spam"}, viewer=TWO).status_code == 404


@pytest.mark.parametrize("kind", ["posts", "comments"])
def test_admin_authorization_is_server_side_and_hide_delete_cascade(client, kind):
    post_id = new_post(client)
    content_id = post_id if kind == "posts" else call(client, "POST", "/api/comments", {"postId": post_id, "body": "Moderation target"}, viewer=TWO).json()["id"]
    target = f"/api/admin/{kind}/{content_id}"
    assert call(client, "GET", "/api/admin/status", viewer=TWO).json() == {"isAdmin": False}
    assert call(client, "GET", "/api/admin/status").json() == {"isAdmin": True}
    for path in ["/api/admin/reports", "/api/admin/status"]:
        assert client[0].get(path).status_code == 401
    assert call(client, "GET", "/api/admin/reports", viewer=TWO).status_code == 403
    for method, data in [("PATCH", {"hidden": True}), ("DELETE", None)]:
        assert call(client, method, target, data, viewer=TWO).status_code == 403
        assert call(client, method, target, data, viewer=NEW).status_code == 403
    assert call(client, "PATCH", target, {"hidden": False}).status_code == 400
    assert call(client, "PATCH", target, {"hidden": True, "userId": TWO}).status_code == 400
    response = call(client, "PATCH", target, {"hidden": True})
    assert response.json() == {"success": True}
    assert_private(response.json())
    with Session(client[1]) as db:
        assert db.get(Post if kind == "posts" else Comment, content_id).hidden is True
    assert call(client, "DELETE", target).json() == {"success": True}
    assert call(client, "DELETE", target).status_code == 404
    with Session(client[1]) as db:
        assert db.get(Post if kind == "posts" else Comment, content_id) is None


def test_empty_admin_configuration_fails_closed_and_username_cannot_grant_admin(client):
    client[0].app.state.settings.admin_anon_ids = ""
    assert call(client, "GET", "/api/admin/status").json() == {"isAdmin": False}
    assert call(client, "GET", "/api/admin/reports").status_code == 403


def test_report_constraints_are_enforced_by_the_database_not_only_validation(client):
    post_id = new_post(client)
    comment_id = call(client, "POST", "/api/comments", {"postId": post_id, "body": "Constraint target"}, viewer=TWO).json()["id"]
    invalid = [{}, {"post_id": post_id, "comment_id": comment_id}]
    for targets in invalid:
        with Session(client[1]) as db, pytest.raises(IntegrityError):
            db.add(Report(id="invalid", reporter_id=TWO, reason="Test constraint", **targets))
            db.commit()
    for targets in [{"post_id": post_id}, {"comment_id": comment_id}]:
        with Session(client[1]) as db, db.begin():
            db.add(Report(id="first-" + next(iter(targets)), reporter_id=TWO, reason="Original reason", **targets))
        with Session(client[1]) as db, pytest.raises(IntegrityError):
            db.add(Report(id="duplicate", reporter_id=TWO, reason="Duplicate reason", **targets))
            db.commit()


def test_admin_setting_rejects_nonanonymous_ids_without_echoing_values():
    from app.config import Settings
    from pydantic import ValidationError
    from test_api import KEY
    with pytest.raises(ValidationError) as error:
        Settings(app_env="test", database_url="sqlite://", backend_shared_secret=KEY, admin_anon_ids="synthetic-private@example.invalid")
    assert "synthetic-private@example.invalid" not in str(error.value)
