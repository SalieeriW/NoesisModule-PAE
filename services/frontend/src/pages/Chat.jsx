import { useRef, useState } from "react";
import { chatCommand } from "../lib/api";

export function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const userMsg = { role: "user", display: text, rawContent: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    scrollToBottom();

    const history = messages.map((m) => ({ role: m.role, content: m.rawContent }));

    try {
      const res = await chatCommand(text, history);
      setMessages([
        ...next,
        {
          role: "assistant",
          display: res.clarification_question ?? null,
          rawContent: res.raw_text,
          command: res.clarification_needed ? null : res.command,
          clarification: res.clarification_needed ? res.clarification_question : null,
        },
      ]);
    } catch (err) {
      setMessages([...next, { role: "assistant", display: null, rawContent: "", error: String(err) }]);
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  }

  return (
    <div className="chat-page">
      <div className="page__hero">
        <h1 className="page__title">Asistente de pintura</h1>
        <p className="page__lede">
          Escribe instrucciones en lenguaje natural — el LLM las convierte en
          comandos estructurados para el robot.
        </p>
      </div>

      <div className="chat">
        <div className="chat__messages">
          {messages.length === 0 && (
            <div className="chat__empty">
              <p>Prueba con:</p>
              <p>
                <em>&ldquo;Pinta de azul cobalto la puerta del conductor&rdquo;</em>
              </p>
              <p>
                <em>&ldquo;Escanea el capó&rdquo;</em>
              </p>
              <p>
                <em>&ldquo;Rojo mate en el parachoques trasero, sin tocar la matrícula&rdquo;</em>
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`chat__msg chat__msg--${msg.role}`}>
              {msg.role === "user" && (
                <div className="chat__bubble chat__bubble--user">{msg.display}</div>
              )}

              {msg.role === "assistant" && !msg.error && (
                <div className="chat__bubble chat__bubble--assistant">
                  {msg.clarification ? (
                    <p className="chat__clarification">❓ {msg.clarification}</p>
                  ) : msg.command ? (
                    <CommandCard command={msg.command} />
                  ) : null}
                </div>
              )}

              {msg.error && (
                <div className="banner banner--error banner--compact">
                  <p>{msg.error}</p>
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="chat__msg chat__msg--assistant">
              <div className="chat__bubble chat__bubble--assistant chat__bubble--thinking">
                Analizando comando…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form className="chat__input-row" onSubmit={handleSend}>
          <input
            className="field__input chat__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ej: Pinta de rojo mate el parachoques trasero…"
            disabled={busy}
            autoComplete="off"
          />
          <button type="submit" className="btn" disabled={busy || !input.trim()}>
            {busy ? "Procesando…" : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CommandCard({ command }) {
  const piece = command.target.piece.replace(/_/g, " ");
  const side = command.target.vehicle_side;

  return (
    <div className="cmd-card">
      <div className="cmd-card__header">
        <span className={`cmd-card__action cmd-card__action--${command.action}`}>
          {command.action}
        </span>
        <span className="cmd-card__piece">{piece}</span>
        {side && <span className="cmd-card__side">({side})</span>}
      </div>

      {(command.parameters.color || command.parameters.finish) && (
        <dl className="kv cmd-card__params">
          {command.parameters.color && (
            <>
              <dt>Color</dt>
              <dd>{command.parameters.color}</dd>
            </>
          )}
          {command.parameters.finish && (
            <>
              <dt>Acabado</dt>
              <dd>{command.parameters.finish}</dd>
            </>
          )}
        </dl>
      )}

      {command.constraints.length > 0 && (
        <p className="cmd-card__constraints">
          Restricciones: {command.constraints.join(", ")}
        </p>
      )}

      <div className="cmd-card__footer">
        <span className="cmd-card__confidence">
          Confianza {Math.round(command.confidence * 100)}%
        </span>
      </div>
    </div>
  );
}
