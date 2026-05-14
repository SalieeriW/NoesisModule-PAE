"""
Chat / LLM endpoint — converts natural-language operator commands to
structured RobotCommand JSON using Google Gemini (gemma-4-31b-it).
"""

import json
import logging
from enum import Enum

from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# RobotCommand schema (mirrors test_llm.py contract)
# ---------------------------------------------------------------------------

class Action(str, Enum):
    PINTAR = "pintar"
    ESCANEAR = "escanear"


class PieceTarget(str, Enum):
    PUERTA_CONDUCTOR = "puerta_conductor"
    PUERTA_ACOMPANANTE = "puerta_acompanante"
    PARACHOQUES_FRONTAL = "parachoques_frontal"
    PARACHOQUES_TRASERO = "parachoques_trasero"
    CAPO = "capo"
    MALETERO = "maletero"
    TECHO = "techo"
    ALERON = "aleron"


class Target(BaseModel):
    piece: PieceTarget
    vehicle_side: str | None = None


class Parameters(BaseModel):
    color: str | None = None
    finish: str | None = None  # "mate" | "brillante" | None


class RobotCommand(BaseModel):
    action: Action
    target: Target
    parameters: Parameters
    constraints: list[str]
    clarification_needed: bool
    clarification_question: str | None
    confidence: float


# ---------------------------------------------------------------------------
# HTTP request / response shapes
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str           # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []  # previous turns for multi-turn context


class ChatResponse(BaseModel):
    command: RobotCommand | None
    raw_text: str
    clarification_needed: bool
    clarification_question: str | None


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """
Eres un parser de comandos para un sistema de pintura robotica automotriz.
Tu unica funcion es convertir instrucciones en lenguaje natural a JSON estructurado.

REGLAS:
- Devuelve UNICAMENTE JSON valido. Sin texto adicional, sin explicaciones, sin markdown.
- El campo "piece" debe ser exactamente uno de estos valores:
  puerta_conductor, puerta_acompanante, parachoques_frontal, parachoques_trasero,
  capo, maletero, techo, aleron
- El campo "action" debe ser exactamente: "pintar" o "escanear"
- Si la pieza es ambigua (ej. "el parachoques" sin especificar frontal o trasero),
  pon clarification_needed=true y formula una pregunta concreta en clarification_question.
  En ese caso pon confidence por debajo de 0.7.
- Si hay restricciones explicitas ("no toques el cristal", "evita la manilla"),
  incluelas en constraints como lista de strings descriptivos.
- Si no se especifica color, pon null en color.

ESTRUCTURA JSON OBLIGATORIA:
{
    "action": "pintar" | "escanear",
    "target": {
        "piece": "<pieza>",
        "vehicle_side": "<izquierda|derecha|null>"
    },
    "parameters": {
        "color": "<color o null>",
        "finish": "<mate|brillante|null>"
    },
    "constraints": [],
    "clarification_needed": false,
    "clarification_question": null,
    "confidence": 0.95
}
"""


# ---------------------------------------------------------------------------
# Core LLM call
# ---------------------------------------------------------------------------

def _build_contents(message: str, history: list[ChatMessage]) -> list:
    """Assembles Gemini contents list from chat history + current message."""
    contents = []
    for turn in history:
        role = "user" if turn.role == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part(text=turn.content)]))
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    return contents


def _parse_llm_response(raw_text: str) -> RobotCommand:
    """Parses the model's raw JSON text into a validated RobotCommand."""
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"El modelo devolvio JSON invalido: {exc}\nRespuesta: {raw_text}") from exc
    try:
        return RobotCommand(**data)
    except ValidationError as exc:
        raise ValueError(f"El JSON no cumple el schema esperado: {exc}") from exc


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    """
    Converts a natural-language operator command (Spanish) into a structured
    RobotCommand.  Pass previous turns in `history` for multi-turn context.
    """
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY not configured. Set it in the environment or .env file.",
        )

    client = genai.Client(api_key=settings.gemini_api_key)
    contents = _build_contents(payload.message, payload.history)

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                temperature=0,
                response_mime_type="application/json",
            ),
        )
    except Exception as exc:
        logger.error("Gemini API error: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM service error: {exc}") from exc

    raw_text = response.text.strip()

    try:
        command = _parse_llm_response(raw_text)
    except ValueError as exc:
        logger.error("LLM parse error: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ChatResponse(
        command=command,
        raw_text=raw_text,
        clarification_needed=command.clarification_needed,
        clarification_question=command.clarification_question,
    )
