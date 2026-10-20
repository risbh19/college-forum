import asyncio
import hashlib
import hmac
import re
import time
from datetime import UTC, datetime

import jwt
from fastapi import HTTPException, Request
from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .models import RateBucket, UsedAssertion


class RequestLimits:
    def __init__(self, app, max_bytes=65536):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if len(scope.get("query_string", b"")) > 2048:
            return await JSONResponse({"error": "Query is too long"}, 414)(scope, receive, send)
        headers = dict(scope["headers"])
        if scope["method"] in {"POST", "PUT", "PATCH"} and headers.get(b"content-type", b"").split(b";")[0].strip().lower() != b"application/json":
            return await JSONResponse({"error": "Use application/json"}, 415)(scope, receive, send)
        chunks, size = [], 0
        deadline = time.monotonic() + 10
        while True:
            try:
                event = await asyncio.wait_for(receive(), timeout=max(0.001, deadline - time.monotonic()))
            except TimeoutError:
                return await JSONResponse({"error": "Request timed out"}, 408)(scope, receive, send)
            if event["type"] == "http.disconnect":
                return
            chunk = event.get("body", b"")
            size += len(chunk)
            if size > self.max_bytes:
                return await JSONResponse({"error": "Request body is too large"}, 413)(scope, receive, send)
            chunks.append(chunk)
            if not event.get("more_body", False):
                break
        body = b"".join(chunks)
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)


async def principal(request: Request) -> str:
    settings = request.app.state.settings
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer ") or len(authorization) > 4096:
        raise HTTPException(401, "A signed service assertion is required")
    try:
        claims = jwt.decode(
            authorization[7:], settings.backend_shared_secret.get_secret_value(),
            algorithms=["HS256"], audience="college-forum-api", issuer="college-forum-web",
            leeway=2, options={"require": ["sub", "iss", "aud", "iat", "nbf", "exp", "jti", "scope", "method", "path", "bodyHash"]},
        )
        if set(claims) != {"sub", "iss", "aud", "iat", "nbf", "exp", "jti", "scope", "method", "path", "bodyHash"}:
            raise ValueError()
        if not re.fullmatch(r"[a-f0-9]{32}", claims["sub"]):
            raise ValueError()
        if not isinstance(claims["jti"], str) or not re.fullmatch(r"[a-f0-9-]{36}", claims["jti"]):
            raise ValueError()
        if any(type(claims[key]) is not int for key in ("iat", "nbf", "exp")) or not 0 < claims["exp"] - claims["iat"] <= 30:
            raise ValueError()
        expected_scope = "identity" if request.url.path == "/internal/session" else "forum"
        if claims["scope"] != expected_scope or claims["method"] != request.method or claims["path"] != request.url.path:
            raise ValueError()
        if not hmac.compare_digest(claims["bodyHash"], hashlib.sha256(await request.body()).hexdigest()):
            raise ValueError()
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, "Invalid service assertion") from None

    await run_in_threadpool(consume_budget, request.app.state.engine, settings, claims, request.method, request.url.path)
    return claims["sub"]


def consume_budget(engine, settings, claims, method, path):
    key = settings.backend_shared_secret.get_secret_value().encode()
    now = int(time.time())
    operation = path if path in {"/api/posts", "/api/comments", "/api/votes", "/api/username"} else "/read"
    limit = {"/api/posts": 10, "/api/comments": 30, "/api/votes": 120, "/api/username": 5}.get(operation, 240) if method != "GET" else 240
    if settings.college_forum_local:
        limit *= 10
    bucket_key = hmac.new(key, f"rate:{claims['sub']}:{method}:{operation}".encode(), hashlib.sha256).hexdigest()
    try:
        with Session(engine) as session:
            if method != "GET":
                nonce = hmac.new(key, f"nonce:{claims['jti']}".encode(), hashlib.sha256).hexdigest()
                session.execute(delete(UsedAssertion).where(UsedAssertion.expires_at < datetime.now(UTC).replace(tzinfo=None)))
                session.add(UsedAssertion(key=nonce, expires_at=datetime.fromtimestamp(claims["exp"] + 2, UTC).replace(tzinfo=None)))
                session.flush()
            insert = pg_insert if session.bind.dialect.name == "postgresql" else sqlite_insert
            statement = insert(RateBucket).values(key=bucket_key, window=now // 60, count=1)
            statement = statement.on_conflict_do_update(
                index_elements=[RateBucket.key],
                set_={"window": now // 60, "count": case((RateBucket.window == now // 60, RateBucket.count + 1), else_=1)},
            ).returning(RateBucket.count)
            count = session.scalar(statement)
            session.commit()
        if count > limit:
            raise HTTPException(429, "Too many requests. Try again shortly.", headers={"Retry-After": str(60 - now % 60)})
    except IntegrityError:
        raise HTTPException(401, "Service assertion was already used") from None
    except SQLAlchemyError:
        raise HTTPException(503, "Service temporarily unavailable") from None
