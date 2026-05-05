from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    anthropic_api_key: str
    anthropic_model: str
    gemini_api_key: str
    supabase_url: str
    supabase_publishable_key: str
    supabase_service_role_key: str
    supabase_storage_bucket: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # ty:ignore[missing-argument]


settings = get_settings()
