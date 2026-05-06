import asyncio
import time
import uuid

import httpx
import websockets


API_BASE = "http://localhost:8080/api/v1"
WS_URL = "ws://localhost:8080/api/v1/ws/events"


async def wait_for_event(expected_type: str, timeout_s: float = 10.0) -> dict:
    deadline = time.time() + timeout_s
    async with websockets.connect(WS_URL) as ws:
        while time.time() < deadline:
            remaining = max(0.1, deadline - time.time())
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            if expected_type in raw:
                import json

                return json.loads(raw)
    raise TimeoutError(f"Timed out waiting for websocket event {expected_type}")


async def run() -> None:
    vin = f"VIN-E2E-{uuid.uuid4().hex[:8].upper()}"
    operator = "op-e2e"

    async with httpx.AsyncClient(timeout=20.0) as client:
        health = await client.get("http://localhost:8080/health")
        assert health.status_code == 200, health.text

        preflight = await client.options(
            f"{API_BASE}/sessions",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight.status_code == 200, preflight.text

        session = (
            await client.post(
                f"{API_BASE}/sessions",
                json={"workcell_id": 1, "operator_id": operator, "vin": vin},
            )
        ).json()
        session_id = session["id"]

        capture = (
            await client.post(
                f"{API_BASE}/captures",
                json={
                    "session_id": session_id,
                    "frame_uri": "s3://paint-artifacts/captures/latest.png",
                    "depth_uri": "s3://paint-artifacts/captures/latest_depth.npy",
                    "camera_pose": {},
                    "intrinsics": {},
                },
            )
        ).json()

        detection = (
            await client.post(
                f"{API_BASE}/detections",
                json={
                    "capture_id": capture["id"],
                    "part_class": "front_left_door",
                    "confidence": 0.91,
                    "bbox": {"x": 10, "y": 20, "w": 200, "h": 220},
                    "raw_mask_uri": "s3://paint-artifacts/masks/front_left_door.png",
                },
            )
        ).json()

        revision = (
            await client.post(
                f"{API_BASE}/masks/revisions",
                json={
                    "detection_id": detection["id"],
                    "mask_uri": "s3://paint-artifacts/masks/front_left_door_edited.png",
                    "author_id": operator,
                    "notes": "e2e-check",
                },
            )
        ).json()

        job = (
            await client.post(
                f"{API_BASE}/paint-jobs",
                json={
                    "session_id": session_id,
                    "detection_id": detection["id"],
                    "approved_revision_id": revision["id"],
                    "created_by": operator,
                    "params": {"color": "white", "mode": "e2e"},
                },
            )
        ).json()

        event_task = asyncio.create_task(wait_for_event("paint_job.started"))
        execute_resp = await client.post(f"{API_BASE}/paint-jobs/{job['id']}/execute", json={})
        assert execute_resp.status_code == 200, execute_resp.text
        event = await event_task
        assert event["type"] == "paint_job.started", event
        assert event["paint_job_id"] == job["id"], event

        cancel_resp = await client.post(f"{API_BASE}/paint-jobs/{job['id']}/cancel", json={})
        assert cancel_resp.status_code == 200, cancel_resp.text

        close_resp = await client.post(f"{API_BASE}/sessions/{session_id}/close", json={})
        assert close_resp.status_code == 200, close_resp.text

    print("E2E check passed")


if __name__ == "__main__":
    asyncio.run(run())
