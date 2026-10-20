from urllib.parse import parse_qs, urlsplit
import re
import certifi

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", env_file=None, hide_input_in_errors=True)
    app_env: str = Field(default="production", pattern="^(production|development|test)$")
    database_url: SecretStr
    direct_url: SecretStr | None = None
    backend_shared_secret: SecretStr
    backend_url: str = "http://127.0.0.1:8000"
    college_forum_local: bool = False
    max_body_bytes: int = 20 * 1024
    admin_anon_ids: str = Field(default="", repr=False)

    def is_admin(self, viewer: str) -> bool:
        return viewer in {value.strip() for value in self.admin_anon_ids.split(",") if value.strip()}

    @model_validator(mode="after")
    def validate_security(self):
        if any(not re.fullmatch(r"[a-f0-9]{32}", value.strip()) for value in self.admin_anon_ids.split(",") if value.strip()):
            raise ValueError("ADMIN_ANON_IDS must contain comma-separated anonymous IDs")
        if len(self.backend_shared_secret.get_secret_value()) < 32:
            raise ValueError("BACKEND_SHARED_SECRET must contain at least 32 characters")
        database = urlsplit(self.database_url.get_secret_value())
        api = urlsplit(self.backend_url)
        if not api.hostname or api.username or api.password or api.path not in {'', '/'} or api.query or api.fragment:
            raise ValueError("BACKEND_URL must be a plain service origin")
        loopback = {"localhost", "127.0.0.1", "::1"}
        if self.app_env == "production" and database.scheme not in {"postgresql", "postgres"}:
            raise ValueError("Production requires PostgreSQL")
        if api.scheme != "https" and not (api.scheme == "http" and api.hostname in loopback):
            raise ValueError("The backend requires HTTPS or HTTP loopback")
        if self.college_forum_local and not (
            self.app_env == "development" and api.hostname in loopback
            and database.hostname in loopback and database.path == "/college_forum_local"
        ):
            raise ValueError("Local demo is restricted to development and its loopback database")
        return self


def sqlalchemy_url(value: str) -> str:
    if not value.startswith(('postgres://', 'postgresql://')):
        return value
    if value.startswith("postgres://"):
        value = "postgresql://" + value[len("postgres://"):]
    if value.startswith("postgresql://"):
        value = "postgresql+psycopg://" + value[len("postgresql://"):]
    # pgbouncer is a Prisma option, not a libpq connection parameter.
    from urllib.parse import parse_qsl, urlencode, urlunsplit
    parts = urlsplit(value)
    query = urlencode([(key, val) for key, val in parse_qsl(parts.query) if key != "pgbouncer"])
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def postgres_connect_args(settings, value):
    options = {"prepare_threshold": None, "connect_timeout": 5}
    if settings.app_env == "production":
        query = parse_qs(urlsplit(value).query)
        options.update(sslmode="verify-full", sslrootcert=query.get("sslrootcert", [certifi.where()])[0])
    return options
