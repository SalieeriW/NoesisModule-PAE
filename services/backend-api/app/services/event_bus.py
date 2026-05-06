import asyncio
import json

import redis.asyncio as redis

from app.core.config import settings


CHANNEL = "paint-events"
SIM_CHANNEL = "sim-events"


class EventBus:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)

    async def publish(self, event: dict):
        await self.client.publish(CHANNEL, json.dumps(event))

    async def subscribe(self):
        pubsub = self.client.pubsub()
        await pubsub.subscribe(CHANNEL, SIM_CHANNEL)
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message.get("data"):
                yield json.loads(message["data"])
            else:
                await asyncio.sleep(0.05)


event_bus = EventBus()
