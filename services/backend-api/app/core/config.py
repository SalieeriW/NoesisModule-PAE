from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_env: str = "dev"
    database_url: str = "postgresql://paint:paint@postgres:5432/paintdb"
    redis_url: str = "redis://redis:6379/0"
    sim_service_url: str = "http://sim-service:8081"
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "paint-artifacts"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480  # 8 hours (one shift)
    gemini_api_key: str = ""
    gemini_model: str = "gemma-4-31b-it"


settings = Settings()
