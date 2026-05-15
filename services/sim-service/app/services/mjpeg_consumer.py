from __future__ import annotations

import asyncio
import time
from typing import Optional

import httpx

BOUNDARY = b"--frame"


class MjpegConsumer:
    """Connects to Unity's MJPEG stream and caches the latest JPEG frame in memory."""

    def __init__(self) -> None:
        self._latest_frame: Optional[bytes] = None
        self._frame_ts: float = 0.0
        self._meta: dict = {}
        self._unity_url: str = ""
        self._task: Optional[asyncio.Task] = None

    def configure(self, unity_url: str) -> None:
        self._unity_url = unity_url.rstrip("/")

    @property
    def latest_frame(self) -> Optional[bytes]:
        return self._latest_frame

    @property
    def frame_age_seconds(self) -> Optional[float]:
        if self._frame_ts == 0.0:
            return None
        return time.time() - self._frame_ts

    @property
    def meta(self) -> dict:
        return self._meta

    async def _fetch_meta(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self._unity_url}/api/viewport/meta")
                if r.status_code == 200:
                    self._meta = r.json()
        except Exception:
            pass

    async def _consume_loop(self) -> None:
        await self._fetch_meta()
        stream_url = f"{self._unity_url}/api/viewport/stream"
        while True:
            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("GET", stream_url) as response:
                        buffer = b""
                        async for chunk in response.aiter_bytes(8192):
                            buffer += chunk
                            while True:
                                start = buffer.find(BOUNDARY)
                                if start == -1:
                                    buffer = buffer[-(len(BOUNDARY) - 1):]
                                    break
                                header_end = buffer.find(b"\r\n\r\n", start)
                                if header_end == -1:
                                    break
                                headers_raw = buffer[start:header_end].decode("utf-8", errors="ignore")
                                cl: Optional[int] = None
                                for line in headers_raw.splitlines():
                                    if line.lower().startswith("content-length:"):
                                        try:
                                            cl = int(line.split(":", 1)[1].strip())
                                        except ValueError:
                                            pass
                                if cl is None:
                                    next_b = buffer.find(BOUNDARY, start + len(BOUNDARY))
                                    if next_b == -1:
                                        break
                                    buffer = buffer[next_b:]
                                    continue
                                frame_start = header_end + 4
                                frame_end = frame_start + cl
                                if len(buffer) < frame_end:
                                    break
                                jpeg = buffer[frame_start:frame_end]
                                buffer = buffer[frame_end:]
                                if jpeg[:2] == b"\xff\xd8":
                                    self._latest_frame = jpeg
                                    self._frame_ts = time.time()
            except asyncio.CancelledError:
                return
            except Exception:
                pass
            await asyncio.sleep(1.0)

    def start(self) -> None:
        self._task = asyncio.create_task(self._consume_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


mjpeg_consumer = MjpegConsumer()
