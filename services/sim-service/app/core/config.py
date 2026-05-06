from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    redis_url: str = "redis://redis:6379/0"
    webots_world_path: str = "/workspace/worlds/painter.wbt"
    controller_path: str = "/workspace/controllers/painter_controller/painter_controller.py"


settings = Settings()
