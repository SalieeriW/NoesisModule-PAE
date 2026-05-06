import asyncio
from datetime import datetime

from app.services import viewport as viewport_mod


class RuntimeAdapter:
    def __init__(self):
        self.running = False
        self.last_event = None

    async def start(self):
        self.running = True
        self.last_event = {"type": "runtime.started", "ts": datetime.utcnow().isoformat()}
        return self.last_event

    async def stop(self):
        self.running = False
        self.last_event = {"type": "runtime.stopped", "ts": datetime.utcnow().isoformat()}
        return self.last_event

    async def capture(self):
        await asyncio.sleep(0)
        return viewport_mod.build_capture_payload()

    async def detect(self):
        await asyncio.sleep(0)
        return viewport_mod.read_detections_list()

    async def execute_paint(self, paint_job_id: int, mask_uri: str, params: dict):
        await asyncio.sleep(0.02)
        cmd = viewport_mod.write_paint_command(
            paint_job_id=paint_job_id,
            mask_uri=mask_uri,
            params=params or {},
        )
        consumed = False
        # Wall-clock wait: Webots consumes the file on the next controller step when sim is running.
        for _ in range(80):
            if not viewport_mod.is_paint_command_pending():
                consumed = True
                break
            await asyncio.sleep(0.05)
        return {
            "paint_job_id": paint_job_id,
            "status": "accepted" if consumed else "pending_controller",
            "mask_uri": mask_uri,
            "params": params,
            "part_class": cmd.get("part_class"),
            "consumed_by_controller": consumed,
            "note": (
                "Webots controller acknowledged paint command."
                if consumed
                else "Paint command file still pending. Restart Webots so updated controller consumes paint_cmd.json."
            ),
        }


runtime_adapter = RuntimeAdapter()
