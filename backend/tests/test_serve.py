import pytest
from app.serve import serve


def test_container_uses_platform_port_and_disables_request_logging(monkeypatch):
    captured = {}
    monkeypatch.setenv('PORT', '10000')
    monkeypatch.setattr('app.serve.uvicorn.run', lambda app, **options: captured.update(app=app, **options))
    serve()
    assert captured['port'] == 10000 and captured['host'] == '0.0.0.0'
    assert captured['factory'] is True and captured['access_log'] is False
    assert captured['proxy_headers'] is False and captured['server_header'] is False


@pytest.mark.parametrize('port', ['abc', '0', '-1', '65536'])
def test_invalid_platform_port_fails_without_echoing_input(monkeypatch, port):
    monkeypatch.setenv('PORT', port)
    with pytest.raises(SystemExit, match='PORT must be a valid TCP port'):
        serve()
