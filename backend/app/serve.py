"""Production container entrypoint; respects Render's assigned PORT."""
import os
import uvicorn


def serve():
    try:
        port = int(os.environ.get('PORT', '8000'))
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        raise SystemExit('PORT must be a valid TCP port') from None
    uvicorn.run('app.main:create_app', factory=True, host='0.0.0.0', port=port,
                access_log=False, server_header=False, proxy_headers=False,
                timeout_keep_alive=5, limit_concurrency=100, backlog=128)


if __name__ == '__main__':
    serve()
