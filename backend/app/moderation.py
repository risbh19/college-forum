from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Comment, Post, Report
from .schemas import AdminStatus, HideInput, ModerationQueue, ReportInput, Success


def moderation_router(settings, member, database):
    router = APIRouter()

    def admin(viewer: str = Depends(member)):
        if not settings.is_admin(viewer):
            raise HTTPException(403, "Admin access required")
        return viewer

    @router.get("/api/admin/status", response_model=AdminStatus)
    def status(viewer: str = Depends(member)):
        return {"isAdmin": settings.is_admin(viewer)}

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

    @router.patch("/api/admin/{kind}/{content_id}", response_model=Success)
    def hide(kind: str, content_id: str, body: HideInput,
             viewer: str = Depends(admin), db: Session = Depends(database, scope="function")):
        if kind not in {"posts", "comments"}:
            raise HTTPException(404, "Content not found")
        target_for(db, kind, content_id).hidden = True
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
