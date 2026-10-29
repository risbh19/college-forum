from secrets import token_hex
from datetime import UTC
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete as sql_delete, func, or_, select
from sqlalchemy.orm import Session

from .models import Comment, Post, Report, User
from .schemas import (AdminAccountsPage, AdminContentPage, AdminOverview, AdminStatus, Board,
                      HideInput, ModerationQueue, ReportInput, Success, SuspensionInput)


def moderation_router(settings, member, database):
    router = APIRouter()

    def admin(viewer: str = Depends(member)):
        if not settings.is_admin(viewer):
            raise HTTPException(403, "Admin access required")
        return viewer

    @router.get("/api/admin/status", response_model=AdminStatus)
    def status(viewer: str = Depends(member)):
        return {"isAdmin": settings.is_admin(viewer)}

    @router.get("/api/admin/overview", response_model=AdminOverview)
    def overview(viewer: str = Depends(admin), db: Session = Depends(database, scope="function")):
        def count(model, *predicates):
            return db.scalar(select(func.count()).select_from(model).where(*predicates))
        targets = select(Report.post_id, Report.comment_id).distinct().subquery()
        return {"members": count(User), "suspendedMembers": count(User, User.suspended.is_(True)),
                "posts": count(Post), "comments": count(Comment),
                "hiddenPosts": count(Post, Post.hidden.is_(True)),
                "hiddenComments": count(Comment, Comment.hidden.is_(True)),
                "reportedItems": db.scalar(select(func.count()).select_from(targets))}

    @router.get("/api/admin/content", response_model=AdminContentPage)
    def content(kind: Literal["posts", "comments"] = "posts", board: Board | None = None,
                visibility: Literal["all", "visible", "hidden"] = "all",
                q: str = Query("", max_length=150), page: int = Query(1, ge=1, le=10000),
                viewer: str = Depends(admin), db: Session = Depends(database, scope="function")):
        model = Post if kind == "posts" else Comment
        query = select(model, User.username).join(User, User.id == model.user_id)
        if model is Comment:
            query = query.join(Post, Post.id == Comment.post_id)
        if board:
            query = query.where(Post.board == board)
        if visibility != "all":
            # A comment beneath a hidden post is also unavailable to members.
            hidden = or_(Comment.hidden.is_(True), Post.hidden.is_(True)) if model is Comment else Post.hidden.is_(True)
            query = query.where(hidden if visibility == "hidden" else ~hidden)
        if q.strip():
            query = query.where(or_(model.body.icontains(q.strip(), autoescape=True),
                                    Post.title.icontains(q.strip(), autoescape=True),
                                    User.username.icontains(q.strip(), autoescape=True)))
        rows = db.execute(query.order_by(model.created_at.desc(), model.id.desc()).offset((page - 1) * 20).limit(21)).all()
        parents = {post.id: post for post in db.scalars(select(Post).where(Post.id.in_({row.post_id for row, _ in rows[:20]})))} if model is Comment else {}
        items = []
        for row, username in rows[:20]:
            parent = parents[row.post_id] if model is Comment else row
            items.append({"id": row.id, "kind": kind, "postId": parent.id, "title": parent.title,
                          "body": row.body, "board": parent.board, "username": username,
                          "createdAt": row.created_at.replace(tzinfo=UTC).isoformat(),
                          "hidden": row.hidden, "parentHidden": parent.hidden if model is Comment else False})
        return {"items": items, "hasMore": len(rows) > 20}

    @router.get("/api/admin/accounts", response_model=AdminAccountsPage)
    def accounts(q: str = Query("", max_length=20), page: int = Query(1, ge=1, le=10000),
                 viewer: str = Depends(admin), db: Session = Depends(database, scope="function")):
        query = select(User)
        if q.strip():
            query = query.where(User.username.icontains(q.strip(), autoescape=True))
        rows = db.scalars(query.order_by(User.created_at.desc(), User.username).offset((page - 1) * 20).limit(21)).all()
        return {"items": [{"username": row.username, "createdAt": row.created_at.replace(tzinfo=UTC).isoformat(),
                           "suspended": row.suspended, "isAdmin": settings.is_admin(row.id)} for row in rows[:20]],
                "hasMore": len(rows) > 20}

    @router.patch("/api/admin/accounts/{username}", response_model=Success)
    def suspend(username: str, body: SuspensionInput, viewer: str = Depends(admin),
                db: Session = Depends(database, scope="function")):
        if len(username) > 20:
            raise HTTPException(400, "Invalid input")
        account = db.scalar(select(User).where(User.username_lower == username.lower()).with_for_update())
        if account is None:
            raise HTTPException(404, "Account not found")
        if settings.is_admin(account.id):
            raise HTTPException(403, "Admin accounts cannot be suspended")
        account.suspended = body.suspended
        db.flush()
        return {"success": True}

    @router.post("/api/reports", response_model=Success)
    def report(body: ReportInput, viewer: str = Depends(member), db: Session = Depends(database, scope="function")):
        # All writers lock the parent first. This serializes threshold checks and
        # prevents reports racing votes, comments, or cascading post deletion.
        comment = db.get(Comment, body.commentId) if body.commentId else None
        post_id = comment.post_id if comment else body.postId
        post = db.scalar(select(Post).where(Post.id == post_id).with_for_update()) if post_id else None
        if post is None or post.hidden:
            raise HTTPException(404, "Content not found")
        target = db.scalar(select(Comment).where(Comment.id == body.commentId).with_for_update().execution_options(populate_existing=True)) if body.commentId else post
        if target is None or target.hidden:
            raise HTTPException(404, "Content not found")
        if target.user_id == viewer:
            raise HTTPException(403, "You cannot report your own content")
        predicate = Report.comment_id == body.commentId if body.commentId else Report.post_id == body.postId
        if db.scalar(select(Report.id).where(predicate, Report.reporter_id == viewer)):
            return {"success": True}
        db.add(Report(id="r" + token_hex(12), post_id=body.postId, comment_id=body.commentId, reporter_id=viewer, reason=body.reason))
        db.flush()
        count = db.scalar(select(func.count(func.distinct(Report.reporter_id))).where(predicate))
        if count >= 3:
            target.hidden = True
            db.flush()
        return {"success": True}

    @router.get("/api/admin/reports", response_model=ModerationQueue)
    def queue(viewer: str = Depends(admin), db: Session = Depends(database, scope="function")):
        # Bounded queue. No author IDs, reporter IDs, or individual report IDs.
        grouped = select(Report.post_id, Report.comment_id, func.max(Report.created_at).label("latest"))
        grouped = grouped.group_by(Report.post_id, Report.comment_id).subquery()
        rows = db.execute(select(grouped).order_by(grouped.c.latest.desc()).limit(100)).all()
        items = []
        for post_id, comment_id, _ in rows:
            target = db.get(Comment, comment_id) if comment_id else db.get(Post, post_id)
            if target is None:
                continue
            predicate = Report.comment_id == comment_id if comment_id else Report.post_id == post_id
            reports = db.scalars(select(Report).where(predicate).order_by(Report.created_at).limit(100)).all()
            items.append({"id": target.id, "kind": "comments" if comment_id else "posts",
                          "title": None if comment_id else target.title, "body": target.body,
                          "hidden": target.hidden, "reportCount": db.scalar(select(func.count()).where(predicate)),
                          "reasons": [entry.reason for entry in reports]})
        return {"items": items}

    def target_for(db, kind, content_id):
        model = Post if kind == "posts" else Comment
        if model is Comment:
            comment = db.get(Comment, content_id)
            if comment:
                db.scalar(select(Post).where(Post.id == comment.post_id).with_for_update())
        target = db.scalar(select(model).where(model.id == content_id).with_for_update())
        if target is None:
            raise HTTPException(404, "Content not found")
        return target

    @router.delete("/api/admin/reports/{kind}/{content_id}", response_model=Success)
    def dismiss(kind: str, content_id: str, viewer: str = Depends(admin),
                db: Session = Depends(database, scope="function")):
        if kind not in {"posts", "comments"}:
            raise HTTPException(404, "Content not found")
        target_for(db, kind, content_id)
        predicate = Report.post_id == content_id if kind == "posts" else Report.comment_id == content_id
        db.execute(sql_delete(Report).where(predicate))
        db.flush()
        return {"success": True}

    @router.patch("/api/admin/{kind}/{content_id}", response_model=Success)
    def hide(kind: str, content_id: str, body: HideInput,
             viewer: str = Depends(admin), db: Session = Depends(database, scope="function")):
        if kind not in {"posts", "comments"}:
            raise HTTPException(404, "Content not found")
        target_for(db, kind, content_id).hidden = body.hidden
        db.flush()
        return {"success": True}

    @router.delete("/api/admin/{kind}/{content_id}", response_model=Success)
    def delete(kind: str, content_id: str, viewer: str = Depends(admin), db: Session = Depends(database, scope="function")):
        if kind not in {"posts", "comments"}:
            raise HTTPException(404, "Content not found")
        db.delete(target_for(db, kind, content_id))
        db.flush()
        return {"success": True}

    return router
