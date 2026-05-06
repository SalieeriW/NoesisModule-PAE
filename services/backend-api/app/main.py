from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.entities import Workcell
from app.services.sim_client import SimServiceConnectError


app = FastAPI(title="Car Paint Backend API", version="0.1.0")


@app.exception_handler(SimServiceConnectError)
async def sim_service_connect_handler(_request: Request, exc: SimServiceConnectError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


app.include_router(router, prefix="/api/v1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    # LAN / Docker: UI opened as http://<host>:5173 must still reach :8080 directly.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_init() -> None:
    # Ensure local/dev stack is immediately usable without manual migration step.
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(Workcell).filter(Workcell.id == 1).first()
        if not existing:
            db.add(
                Workcell(
                    id=1,
                    name="workcell-1",
                    status="idle",
                    camera_config={},
                )
            )
            db.commit()
    finally:
        db.close()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "backend-api"}
