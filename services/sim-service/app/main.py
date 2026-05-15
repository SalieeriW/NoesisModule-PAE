from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.core.config import settings
from app.services.mjpeg_consumer import mjpeg_consumer
from app.services.perception import perception_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    mjpeg_consumer.configure(settings.unity_url)
    mjpeg_consumer.start()
    perception_service.load_model(settings.yolo_weights, settings.yolo_device)
    yield
    await mjpeg_consumer.stop()


app = FastAPI(title="Car Paint Sim Service", version="0.1.0", lifespan=lifespan)
app.include_router(router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "service": "sim-service"}
