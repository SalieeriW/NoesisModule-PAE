from fastapi import APIRouter, WebSocket

from app.services.event_bus import event_bus

router = APIRouter()


@router.websocket("/ws/events")
async def events_socket(websocket: WebSocket):
    await websocket.accept()
    async for event in event_bus.subscribe():
        await websocket.send_json(event)
