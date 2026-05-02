from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    JWT_SECRET: str
    MASTER_KEY: str
    CORS_ORIGINS: str = "http://localhost:6288"
    PUBLIC_FRONTEND_URL: str = "http://localhost:6288"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ADMIN_BOOTSTRAP_EMAILS: str = ""
    MEDIA_ROOT: str = "/app/media"
    MEDIA_URL: str = "/media"
    AVATAR_MAX_BYTES: int = 2_000_000

    model_config = SettingsConfigDict(case_sensitive=True)


settings = Settings()
