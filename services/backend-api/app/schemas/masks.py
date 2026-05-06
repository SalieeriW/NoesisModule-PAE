from datetime import datetime

from pydantic import BaseModel


class MaskRevisionCreate(BaseModel):
    detection_id: int
    mask_uri: str
    author_id: str
    notes: str | None = None


class MaskRevisionOut(MaskRevisionCreate):
    id: int
    revision_no: int
    source: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class MaskRevisionRichOut(MaskRevisionOut):
    part_class: str | None = None
    capture_id: int | None = None
    session_id: int | None = None
    vin: str | None = None
