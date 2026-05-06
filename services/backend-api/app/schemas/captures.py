from pydantic import BaseModel


class CaptureCreate(BaseModel):
    session_id: int
    frame_uri: str
    depth_uri: str
    camera_pose: dict = {}
    intrinsics: dict = {}


class CaptureOut(CaptureCreate):
    id: int

    class Config:
        from_attributes = True
