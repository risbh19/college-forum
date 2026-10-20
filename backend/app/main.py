from datetime import UTC
from secrets import token_hex
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import and_, case, create_engine, func, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings, postgres_connect_args, sqlalchemy_url
from .models import Comment, Post, RateBucket, Report, UsedAssertion, User, Vote, VoteType
from .moderation import moderation_router
from .schemas import Board, CommentInput, CommentView, CommentsPage, PostInput, PostsPage, PostView, UsernameInput, VoteInput, VoteState
from .security import RequestLimits, principal


def serialize_date(value):
    return value.replace(tzinfo=UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def vote_states(db, ids, viewer):
    states = {post_id: {"score": 0, "myVote": None} for post_id in ids}
    if not ids:
        return states
    totals = db.execute(select(Vote.post_id, func.sum(case((Vote.type == VoteType.UP, 1), else_=-1))).where(Vote.post_id.in_(ids)).group_by(Vote.post_id))
    for post_id, score in totals:
        states[post_id]["score"] = int(score)
    for post_id, value in db.execute(select(Vote.post_id, Vote.type).where(Vote.post_id.in_(ids), Vote.user_id == viewer)):
        states[post_id]["myVote"] = value.value
    return states


def post_views(db, posts, viewer):
    ids = [post.id for post in posts]
    states = vote_states(db, ids, viewer)
    counts = dict(db.execute(select(Comment.post_id, func.count()).where(Comment.post_id.in_(ids), Comment.hidden.is_(False)).group_by(Comment.post_id)).all()) if ids else {}
    names = dict(db.execute(select(User.id, User.username).where(User.id.in_({post.user_id for post in posts}))).all()) if posts else {}
    return [{"id": post.id, "title": post.title, "body": post.body, "board": post.board,
             "createdAt": serialize_date(post.created_at), "author": {"username": names[post.user_id]},
             "commentCount": counts.get(post.id, 0), **states[post.id], "isMine": post.user_id == viewer} for post in posts]


def comment_view(row, name, viewer):
    return {"id": row.id, "body": row.body, "createdAt": serialize_date(row.created_at),
            "author": {"username": name}, "isMine": row.user_id == viewer}


def create_app(settings: Settings | None = None, engine=None):
    settings = settings or Settings()
    production = settings.app_env == "production"
    app = FastAPI(title="College Forum API", version="2.0.0", docs_url=None if production else "/docs",
                  redoc_url=None, openapi_url=None if production else "/openapi.json")
    if engine is None:
        options = {"pool_pre_ping": True, "hide_parameters": True}
        if settings.database_url.get_secret_value().startswith(("postgres:", "postgresql:")):
            options["connect_args"] = postgres_connect_args(settings, settings.database_url.get_secret_value())
            options.update(pool_size=5, max_overflow=5, pool_recycle=300)
        engine = create_engine(sqlalchemy_url(settings.database_url.get_secret_value()), **options)
    app.state.settings, app.state.engine = settings, engine
    hosts = [urlsplit(settings.backend_url).hostname]
    if settings.app_env in {"test", "development"}:
        hosts += ["127.0.0.1", "localhost", "[::1]"]
    if settings.app_env == "test":
        hosts += ["testserver"]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
    app.add_middleware(RequestLimits, max_bytes=settings.max_body_bytes)

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.update({"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                                 "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer"})
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, error):
        return JSONResponse({"error": error.detail}, status_code=error.status_code, headers=error.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        # Never echo Pydantic's input field or the raw request body.
        return JSONResponse({"error": "Invalid input"}, status_code=400)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, error):
        return JSONResponse({"error": "Service temporarily unavailable"}, status_code=503)

    @app.exception_handler(Exception)
    async def internal_error(request, error):
        return JSONResponse({"error": "Something went wrong"}, status_code=500)

    def database():
        with Session(engine, expire_on_commit=False) as db:
            with db.begin():
                yield db

    def member(viewer: str = Depends(principal), db: Session = Depends(database, scope="function")):
        if db.get(User, viewer) is None:
            raise HTTPException(403, "Choose a username first")
        return viewer

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get('/ready')
    def ready(db: Session = Depends(database, scope='function')):
        if engine.dialect.name == 'postgresql':
            db.execute(text("SET LOCAL statement_timeout = '3000ms'"))
        revision = db.execute(text('SELECT version_num FROM alembic_version')).scalar_one_or_none()
        if revision != '0002_reports':
            raise HTTPException(503, 'Service temporarily unavailable')
        for model in (User, Post, Comment, Vote, Report, RateBucket, UsedAssertion):
            db.execute(select(model).limit(0))
        return {'status': 'ready'}

    @app.get("/internal/session")
    def identity(viewer: str = Depends(principal), db: Session = Depends(database, scope="function")):
        return {"username": db.scalar(select(User.username).where(User.id == viewer))}

    @app.post("/api/username")
    def username(body: UsernameInput, viewer: str = Depends(principal), db: Session = Depends(database, scope="function")):
        if db.get(User, viewer):
            raise HTTPException(409, "Username already set")
        try:
            db.add(User(id=viewer, username=body.username, username_lower=body.username.lower()))
            db.flush()
        except IntegrityError:
            raise HTTPException(409, "Username already taken or already set") from None
        return {"username": body.username}

    @app.get("/api/posts", response_model=PostsPage)
    def posts(board: Board | None = None, cursor: str | None = Query(None, min_length=1, max_length=40),
              viewer: str = Depends(member), db: Session = Depends(database, scope="function")):
        query = select(Post).where(Post.hidden.is_(False))
        if board:
            query = query.where(Post.board == board)
        if cursor:
            anchor = db.get(Post, cursor)
            if not anchor or anchor.hidden or (board and anchor.board != board):
                raise HTTPException(400, "This page link has expired. Refresh the feed and try again.")
            query = query.where(or_(Post.created_at < anchor.created_at, and_(Post.created_at == anchor.created_at, Post.id < anchor.id)))
        rows = db.scalars(query.order_by(Post.created_at.desc(), Post.id.desc()).limit(21)).all()
        return {"posts": post_views(db, rows[:20], viewer), "nextCursor": rows[19].id if len(rows) > 20 else None}

    @app.post("/api/posts", response_model=PostView, status_code=201)
    def create_post(body: PostInput, viewer: str = Depends(member), db: Session = Depends(database, scope="function")):
        row = Post(id="c" + token_hex(12), title=body.title, body=body.body, board=body.board, user_id=viewer)
        db.add(row)
        db.flush()
        return post_views(db, [row], viewer)[0]

    @app.get("/api/posts/{post_id}", response_model=PostView)
    def get_post(post_id: str, viewer: str = Depends(member), db: Session = Depends(database, scope="function")):
        row = db.get(Post, post_id)
        if row is None or row.hidden:
            raise HTTPException(404, "Post not found")
        return post_views(db, [row], viewer)[0]

    @app.delete("/api/posts/{post_id}")
    def delete_post(post_id: str, viewer: str = Depends(member), db: Session = Depends(database, scope="function")):
        row = db.scalar(select(Post).where(Post.id == post_id).with_for_update())
        if row is None:
            raise HTTPException(404, "Post not found")
        if row.user_id != viewer:
            raise HTTPException(403, "Not your post")
        db.delete(row)
        db.flush()
        return {"success": True}

    @app.get("/api/comments", response_model=CommentsPage)
    def comments(postId: str = Query(..., min_length=1, max_length=40), viewer: str = Depends(member), db: Session = Depends(database, scope="function")):
        if db.scalar(select(Post.id).where(Post.id == postId, Post.hidden.is_(False))) is None:
            raise HTTPException(404, "Post not found")
        rows = db.execute(select(Comment, User.username).join(User, User.id == Comment.user_id)
                          .where(Comment.post_id == postId, Comment.hidden.is_(False)).order_by(Comment.created_at, Comment.id)).all()
        return {"comments": [comment_view(row, name, viewer) for row, name in rows]}

    @app.post("/api/comments", response_model=CommentView, status_code=201)
    def create_comment(body: CommentInput, viewer: str = Depends(member), db: Session = Depends(database, scope="function")):
        if db.scalar(select(Post.id).where(Post.id == body.postId, Post.hidden.is_(False)).with_for_update()) is None:
            raise HTTPException(404, "Post not found")
        row = Comment(id="c" + token_hex(12), body=body.body, post_id=body.postId, user_id=viewer)
        db.add(row)
        db.flush()
        return comment_view(row, db.scalar(select(User.username).where(User.id == viewer)), viewer)

    @app.post("/api/votes", response_model=VoteState)
    def vote(body: VoteInput, viewer: str = Depends(member), db: Session = Depends(database, scope="function")):
        # Lock the parent row, including when the user's vote doesn't exist yet.
        if db.scalar(select(Post.id).where(Post.id == body.postId, Post.hidden.is_(False)).with_for_update()) is None:
            raise HTTPException(404, "Post not found")
        row = db.get(Vote, (viewer, body.postId))
        value = VoteType(body.type)
        if row is None:
            db.add(Vote(user_id=viewer, post_id=body.postId, type=value))
        elif row.type == value:
            db.delete(row)
        else:
            row.type = value
        db.flush()
        return vote_states(db, [body.postId], viewer)[body.postId]

    app.include_router(moderation_router(settings, member, database))
    return app
