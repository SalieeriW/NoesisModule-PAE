from datetime import datetime

from pydantic import BaseModel


class SessionCreate(BaseModel):
    workcell_id: int
    operator_id: str
    vin: str


class SessionOut(SessionCreate):
    id: int
    status: str
    started_at: datetime | None = None
    ended_at: datetime | None = None

    class Config:
        from_attributes = True
