from pydantic import BaseModel


class DetectionCreate(BaseModel):
    capture_id: int
    part_class: str
    confidence: float
    bbox: dict = {}
    raw_mask_uri: str


class DetectionOut(DetectionCreate):
    id: int
    status: str

    class Config:
        from_attributes = True
