import asyncio
from datetime import datetime

import httpx

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
        from app.services.perception import perception_service
        frame = viewport_mod.load_latest_viewport_jpeg()
        return await asyncio.to_thread(
            perception_service.run_detection,
            frame,
            viewport_mod.mask_export_dir(),
        )

    async def execute_paint(self, paint_job_id: int, mask_uri: str, params: dict):
        try:
            cmd = await viewport_mod.write_paint_command(
                paint_job_id=paint_job_id,
                mask_uri=mask_uri,
                params=params or {},
            )
            return {
                "paint_job_id": paint_job_id,
                "status": "accepted",
                "mask_uri": mask_uri,
                "params": params,
                "part_class": cmd.get("part_class"),
                "consumed_by_controller": True,
                "note": "Unity acknowledged paint command.",
            }
        except (httpx.HTTPError, Exception) as exc:
            return {
                "paint_job_id": paint_job_id,
                "status": "pending_controller",
                "mask_uri": mask_uri,
                "params": params,
                "part_class": None,
                "consumed_by_controller": False,
                "note": f"Unity bridge error: {exc}",
            }


runtime_adapter = RuntimeAdapter()
