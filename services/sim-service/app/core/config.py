from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    redis_url: str = "redis://redis:6379/0"
    unity_url: str = "http://host.docker.internal:8082"
    yolo_weights: str = "best.pt"
    yolo_device: str = "cpu"
    mask_export_dir: str = "/app/mask_exports"


settings = Settings()
