from pydantic import BaseModel


class PaintJobCreate(BaseModel):
    session_id: int
    detection_id: int
    approved_revision_id: int
    created_by: str
    params: dict = {}


class PaintJobOut(PaintJobCreate):
    id: int
    status: str

    class Config:
        from_attributes = True
