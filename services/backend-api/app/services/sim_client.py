import httpx

from app.core.config import settings


class SimServiceConnectError(Exception):
    """Sim-service is unreachable (DNS/TCP). Usually sim-service is not running or not on the Compose network."""


def _sim_unreachable_message(exc: httpx.ConnectError) -> str:
    return (
        f"Cannot reach sim-service at {settings.sim_service_url} ({exc}). "
        "Ensure the `sim-service` container is Up: `docker compose ps` then "
        "`docker compose up -d sim-service` from `infra/` (same project as backend-api)."
    )


async def _request(
    method: str,
    path: str,
    *,
    timeout: float = 30.0,
    **kwargs,
) -> httpx.Response:
    url = f"{settings.sim_service_url}{path}"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.request(method, url, **kwargs)
    except httpx.ConnectError as exc:
        raise SimServiceConnectError(_sim_unreachable_message(exc)) from exc


async def runtime_start() -> dict:
    resp = await _request("POST", "/api/v1/runtime/start")
    resp.raise_for_status()
    return resp.json()


async def runtime_stop() -> dict:
    resp = await _request("POST", "/api/v1/runtime/stop")
    resp.raise_for_status()
    return resp.json()


async def runtime_capture() -> dict:
    resp = await _request("POST", "/api/v1/runtime/capture")
    resp.raise_for_status()
    return resp.json()


async def runtime_detect() -> list[dict]:
    resp = await _request("POST", "/api/v1/runtime/detect")
    resp.raise_for_status()
    return resp.json()


async def runtime_camera_control(dx: float, dy: float, zoom: float) -> dict:
    resp = await _request(
        "POST",
        "/api/v1/runtime/camera/control",
        json={"dx": dx, "dy": dy, "zoom": zoom},
    )
    resp.raise_for_status()
    return resp.json()


async def runtime_view_latest_jpg() -> bytes:
    resp = await _request("GET", "/api/v1/runtime/view/latest.jpg")
    resp.raise_for_status()
    return resp.content


async def runtime_view_stream_chunked():
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "GET",
                f"{settings.sim_service_url}/api/v1/runtime/view/stream.mjpg",
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes():
                    if chunk:
                        yield chunk
    except httpx.ConnectError as exc:
        raise SimServiceConnectError(_sim_unreachable_message(exc)) from exc


async def runtime_status() -> dict:
    resp = await _request("GET", "/api/v1/runtime/status", timeout=10.0)
    resp.raise_for_status()
    return resp.json()


async def runtime_mask_png(filename: str) -> bytes:
    resp = await _request("GET", f"/api/v1/runtime/masks/{filename}")
    resp.raise_for_status()
    return resp.content


async def runtime_mask_upload_png(file_bytes: bytes, filename: str = "edited.png") -> dict:
    files = {"file": (filename, file_bytes, "image/png")}
    resp = await _request(
        "POST",
        "/api/v1/runtime/masks/upload",
        files=files,
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.json()


async def dispatch_paint_job(paint_job_id: int, mask_uri: str, params: dict) -> dict:
    resp = await _request(
        "POST",
        "/api/v1/runtime/paint",
        json={"paint_job_id": paint_job_id, "mask_uri": mask_uri, "params": params},
    )
    resp.raise_for_status()
    return resp.json()
