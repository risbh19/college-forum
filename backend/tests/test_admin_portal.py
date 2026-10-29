import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Comment, Post, User
from test_api import ONE, TWO, NEW, assert_private, call, client, new_post


@pytest.mark.parametrize("path", ["overview", "content", "accounts", "reports"])
def test_admin_reads_require_configured_admin_and_do_not_leak_identity(client, path):
    endpoint = f"/api/admin/{path}"
    assert client[0].get(endpoint).status_code == 401
    assert call(client, "GET", endpoint, viewer=TWO).status_code == 403
    assert call(client, "GET", endpoint, viewer=NEW).status_code == 403
    response = call(client, "GET", endpoint)
    assert response.status_code == 200
    assert_private(response.json())
    assert ONE not in response.text and TWO not in response.text
    client[0].app.state.settings.admin_anon_ids = ""
    assert call(client, "GET", endpoint).status_code == 403


def test_admin_search_hidden_parent_filters_and_literal_wildcards(client):
    post_id = new_post(client)
    comment_id = call(client, "POST", "/api/comments", {"postId": post_id, "body": "Special comment"}, viewer=TWO).json()["id"]
    assert call(client, "PATCH", f"/api/admin/posts/{post_id}", {"hidden": True}).status_code == 200
    response = call(client, "GET", "/api/admin/content?kind=comments&visibility=hidden&q=campusowl&board=general")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["id"] == comment_id and item["parentHidden"] is True and item["hidden"] is False
    assert_private(response.json())
    for query in ["kind=comments&visibility=visible", "q=absent", "q=%25", "board=cse"]:
        assert call(client, "GET", f"/api/admin/content?{query}").json()["items"] == []
    assert call(client, "GET", f"/api/posts/{post_id}").status_code == 404
    assert call(client, "PATCH", f"/api/admin/posts/{post_id}", {"hidden": False}).status_code == 200
    assert call(client, "GET", f"/api/posts/{post_id}").status_code == 200


def test_admin_pagination_is_bounded_and_stable(client):
    with Session(client[1]) as db, db.begin():
        db.add_all([Post(id=f"page-{n:02}", title="Paging", body="Content", board="general", user_id=ONE) for n in range(23)])
    first = call(client, "GET", "/api/admin/content").json()
    second = call(client, "GET", "/api/admin/content?page=2").json()
    assert len(first["items"]) == 20 and first["hasMore"] is True
    assert len(second["items"]) == 3 and second["hasMore"] is False
    assert not {row["id"] for row in first["items"]} & {row["id"] for row in second["items"]}
    for query in ["page=0", "page=10001", "kind=users", "visibility=wrong", "board=wrong", "q=" + "x" * 151]:
        assert call(client, "GET", "/api/admin/content?" + query).status_code == 400


def test_dismiss_reports_does_not_restore_content_and_requires_admin(client):
    post_id = new_post(client)
    call(client, "POST", "/api/reports", {"postId": post_id, "reason": "Spam content"}, viewer=TWO)
    call(client, "PATCH", f"/api/admin/posts/{post_id}", {"hidden": True})
    endpoint = f"/api/admin/reports/posts/{post_id}"
    assert call(client, "DELETE", endpoint, viewer=TWO).status_code == 403
    assert call(client, "DELETE", endpoint).json() == {"success": True}
    assert call(client, "GET", "/api/admin/reports").json() == {"items": []}
    assert call(client, "GET", f"/api/posts/{post_id}").status_code == 404
    assert call(client, "DELETE", endpoint).status_code == 200
    assert call(client, "DELETE", "/api/admin/reports/posts/missing").status_code == 404


def test_suspend_restore_blocks_existing_account_on_all_forum_routes(client):
    post_id = new_post(client)
    endpoint = "/api/admin/accounts/campusowl"
    assert call(client, "PATCH", endpoint, {"suspended": True}, viewer=TWO).status_code == 403
    assert call(client, "PATCH", endpoint, {"suspended": "true"}).status_code == 400
    assert call(client, "PATCH", endpoint, {"suspended": True, "userId": ONE}).status_code == 400
    assert call(client, "PATCH", "/api/admin/accounts/shadowcoder42", {"suspended": True}).status_code == 403
    assert call(client, "PATCH", "/api/admin/accounts/missing", {"suspended": True}).status_code == 404
    assert call(client, "PATCH", endpoint, {"suspended": True}).json() == {"success": True}
    for method, path, body in [
        ("GET", "/api/posts", None), ("GET", f"/api/posts/{post_id}", None),
        ("GET", f"/api/comments?postId={post_id}", None), ("GET", "/api/admin/status", None),
        ("POST", "/api/posts", {"title": "Blocked post", "body": "Text", "board": "general"}),
        ("POST", "/api/comments", {"postId": post_id, "body": "Blocked"}),
        ("POST", "/api/votes", {"postId": post_id, "type": "UP"}),
        ("POST", "/api/reports", {"postId": post_id, "reason": "Blocked"}),
        ("DELETE", f"/api/posts/{post_id}", None),
    ]:
        response = call(client, method, path, body, viewer=TWO)
        assert response.status_code == 403 and response.json() == {"error": "Your account is suspended"}
    overview = call(client, "GET", "/api/admin/overview").json()
    assert overview["suspendedMembers"] == 1 and overview["posts"] == 1
    accounts = call(client, "GET", "/api/admin/accounts?q=campusowl").json()
    assert accounts["items"][0]["suspended"] is True
    assert_private(accounts)
    assert call(client, "PATCH", endpoint.upper().replace('/API/ADMIN/ACCOUNTS/', '/api/admin/accounts/'), {"suspended": False}).status_code == 200
    assert call(client, "GET", "/api/posts", viewer=TWO).status_code == 200


def test_account_pagination_and_comment_restore_and_cascade(client):
    with Session(client[1]) as db, db.begin():
        db.add_all([User(id=f"{n:032x}", username=f"member_{n}", username_lower=f"member_{n}") for n in range(10, 31)])
    first = call(client, "GET", "/api/admin/accounts").json()
    second = call(client, "GET", "/api/admin/accounts?page=2").json()
    assert len(first["items"]) == 20 and first["hasMore"] is True
    assert len(second["items"]) == 3 and second["hasMore"] is False
    assert not {row["username"] for row in first["items"]} & {row["username"] for row in second["items"]}
    post_id = new_post(client)
    comment_id = call(client, "POST", "/api/comments", {"postId": post_id, "body": "Review"}, viewer=TWO).json()["id"]
    target = f"/api/admin/comments/{comment_id}"
    assert call(client, "PATCH", target, {"hidden": True}).status_code == 200
    call(client, "PATCH", target, {"hidden": False})
    assert len(call(client, "GET", f"/api/comments?postId={post_id}").json()["comments"]) == 1
    call(client, "DELETE", f"/api/admin/posts/{post_id}")
    with Session(client[1]) as db:
        assert db.get(Comment, comment_id) is None
