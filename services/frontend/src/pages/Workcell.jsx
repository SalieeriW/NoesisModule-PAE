import { useEffect, useRef, useState } from "react";
import { MaskOverlayEditor } from "../components/MaskOverlayEditor";
import { useOperator } from "../context/OperatorContext";
import { useWorkbench } from "../context/WorkbenchContext";
import { chatCommand } from "../lib/api";
import { vinHint } from "../lib/validation";

const STEPS = [
  { label: "Session & Detection" },
  { label: "Mask Review" },
  { label: "Execute" },
];

export function Workcell() {
  const { detection, revision } = useWorkbench();

  const maxStep = detection ? (revision ? 2 : 1) : 0;
  const [viewStep, setViewStep] = useState(0);

  return (
    <div className="page fade-in">
      <header className="page__hero">
        <h1 className="page__title">Process</h1>
        <p className="page__lede">
          Guided painting workflow — session, detection, mask review, and execution in one place.
        </p>
      </header>

      <ProcessStepper
        steps={STEPS}
        viewStep={viewStep}
        maxStep={maxStep}
        onStepClick={setViewStep}
      />

      {viewStep === 0 && <StepSession onContinue={() => setViewStep(1)} />}
      {viewStep === 1 && <StepMask onContinue={() => setViewStep(2)} />}
      {viewStep === 2 && <StepExecute />}
    </div>
  );
}

function ProcessStepper({ steps, viewStep, maxStep, onStepClick }) {
  return (
    <nav className="stepper" aria-label="Process steps">
      {steps.map((step, idx) => {
        const isDone = idx < maxStep;
        const isActive = idx === viewStep;
        const isLocked = idx > maxStep;
        const isClickable = !isLocked && !isActive;

        let cls = "stepper__step";
        if (isActive) cls += " stepper__step--active";
        if (isDone) cls += " stepper__step--done";
        if (isLocked) cls += " stepper__step--locked";
        if (isClickable) cls += " stepper__step--clickable";

        return (
          <div
            key={idx}
            className={cls}
            onClick={() => isClickable && onStepClick(idx)}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={(e) => e.key === "Enter" && isClickable && onStepClick(idx)}
            aria-current={isActive ? "step" : undefined}
          >
            <div className="stepper__circle">
              {isDone && !isActive ? "✓" : idx + 1}
            </div>
            <span className="stepper__label">{step.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1 — Session & Detection                                        */
/* ------------------------------------------------------------------ */

function StepSession({ onContinue }) {
  const {
    session,
    vin,
    setVin,
    simDetections,
    selectedDetectionIndex,
    setSelectedDetectionIndex,
    detection,
    beginFlow,
    redetect,
    applySelectedDetection,
    busy,
    runtimeStatus,
    flowError,
    setFlowError,
  } = useWorkbench();

  return (
    <div className="step-content fade-in">
      {flowError && (
        <div className="banner banner--error">
          <p>{flowError}</p>
        </div>
      )}

      <section className="panel">
        <h2 className="panel__title">Vehicle</h2>
        <div className="form">
          <label className="field">
            <span className="field__label">VIN or demo id</span>
            <input
              className="field__input"
              value={vin}
              onChange={(e) => {
                setFlowError("");
                setVin(e.target.value.toUpperCase());
              }}
              placeholder="e.g. 1HGBH41JXMN109186 or DEMO-LAB01"
              autoComplete="off"
            />
            <span className="field__hint">{vinHint()}</span>
          </label>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn"
            disabled={busy || !!session || runtimeStatus !== "running"}
            onClick={() => beginFlow()}
          >
            Start session + capture + detect
          </button>
          {session && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy || runtimeStatus !== "running"}
              onClick={() => redetect()}
              title="Re-run capture and detection on the current session"
            >
              Re-detect
            </button>
          )}
        </div>
        <p className="help">
          {session
            ? `Session #${session.id} open · Close it from Overview when finished.`
            : "No active session."}
        </p>
      </section>

      <div className="step-cols">
        <EmbeddedChat
          simDetections={simDetections}
          onSelect={(idx) => applySelectedDetection(idx)}
          ready={simDetections.length > 0}
        />

        <section className="panel">
          <h2 className="panel__title">Manual selection</h2>
          {simDetections.length > 0 ? (
            <>
              <p className="panel__muted">
                Use the dropdown if the assistant didn't match the right part.
              </p>
              <label className="field">
                <span className="field__label">YOLO candidates</span>
                <select
                  className="field__input"
                  value={selectedDetectionIndex}
                  onChange={(e) => setSelectedDetectionIndex(Number(e.target.value))}
                  disabled={busy}
                >
                  {simDetections.map((part, idx) => (
                    <option key={`${part.part_class}-${idx}`} value={idx}>
                      {part.part_class.replace(/_/g, " ")} · {(part.confidence * 100).toFixed(0)}%
                    </option>
                  ))}
                </select>
              </label>
              <div className="page__actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() => applySelectedDetection()}
                >
                  Use selected part
                </button>
              </div>
              {detection && (
                <p className="help">
                  Locked:{" "}
                  <strong>{detection.part_class.replace(/_/g, " ")}</strong>{" "}
                  · {(detection.confidence * 100).toFixed(0)}%
                </p>
              )}
            </>
          ) : (
            <p className="panel__muted">
              {session
                ? "No parts detected — adjust the viewport and run a new session."
                : "Start a session to see YOLO candidates."}
            </p>
          )}
        </section>
      </div>

      {detection && (
        <div className="step-footer">
          <span className="step-footer__hint">
            Locked: <strong>{detection.part_class.replace(/_/g, " ")}</strong>{" "}
            · {(detection.confidence * 100).toFixed(0)}%
          </span>
          <button type="button" className="btn" onClick={onContinue}>
            Continue to Mask Review →
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Embedded chat                                                        */
/* ------------------------------------------------------------------ */

function EmbeddedChat({ simDetections, onSelect, ready }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const bottomRef = useRef(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || chatBusy) return;

    const userMsg = { role: "user", display: text, rawContent: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setChatBusy(true);
    scrollToBottom();

    const history = messages.map((m) => ({ role: m.role, content: m.rawContent }));

    try {
      const res = await chatCommand(text, history);
      const assistantMsg = {
        role: "assistant",
        rawContent: res.raw_text,
        command: res.clarification_needed ? null : res.command,
        clarification: res.clarification_needed ? res.clarification_question : null,
        noMatch: null,
        error: null,
      };

      if (!res.clarification_needed && res.command) {
        const piece = res.command.target.piece;
        const matchIdx = simDetections.findIndex((d) => d.part_class === piece);
        if (matchIdx >= 0) {
          assistantMsg.matched = true;
          onSelect(matchIdx);
        } else {
          assistantMsg.noMatch = piece;
        }
      }

      setMessages([...next, assistantMsg]);
    } catch (err) {
      setMessages([
        ...next,
        { role: "assistant", rawContent: "", error: String(err) },
      ]);
    } finally {
      setChatBusy(false);
      scrollToBottom();
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Paint assistant</h2>
      <p className="panel__muted">
        Describe which part to paint — the assistant will select it automatically.
      </p>

      <div className="chat chat--embedded">
        <div className="chat__messages chat__messages--embedded">
          {messages.length === 0 && (
            <div className="chat__empty">
              {ready ? (
                <p>Try: <em>&ldquo;Paint the front bumper cobalt blue&rdquo;</em></p>
              ) : (
                <p>Start a session and run detection first.</p>
              )}
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
                    <EmbeddedCommandCard command={msg.command} matched={!!msg.matched} />
                  ) : null}
                  {msg.noMatch && (
                    <p className="chat__no-match">
                      <strong>{msg.noMatch.replace(/_/g, " ")}</strong> not detected in
                      current frame — use the dropdown.
                    </p>
                  )}
                </div>
              )}

              {msg.error && (
                <div className="banner banner--error banner--compact">
                  <p>{msg.error}</p>
                </div>
              )}
            </div>
          ))}

          {chatBusy && (
            <div className="chat__msg chat__msg--assistant">
              <div className="chat__bubble chat__bubble--assistant chat__bubble--thinking">
                Analyzing command…
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
            placeholder="E.g.: Paint the back bumper matte red…"
            disabled={chatBusy || !ready}
            autoComplete="off"
          />
          <button type="submit" className="btn" disabled={chatBusy || !input.trim() || !ready}>
            {chatBusy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}

function EmbeddedCommandCard({ command, matched }) {
  const piece = (command.target.piece ?? "").replace(/_/g, " ");

  return (
    <div className="cmd-card">
      <div className="cmd-card__header">
        <span className={`cmd-card__action cmd-card__action--${command.action}`}>
          {command.action}
        </span>
        <span className="cmd-card__piece">{piece}</span>
        {matched && <span className="cmd-card__matched">✓ auto-selected</span>}
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
          Confidence {Math.round(command.confidence * 100)}%
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — Mask Review                                                 */
/* ------------------------------------------------------------------ */

function StepMask({ onContinue }) {
  const {
    capture,
    detection,
    maskUri,
    applyMaskUriFromUpload,
    setMaskBrushDirty,
    notes,
    setNotes,
    submitMask,
    revision,
    busy,
    flowError,
  } = useWorkbench();

  return (
    <div className="step-content fade-in">
      {flowError && (
        <div className="banner banner--error">
          <p>{flowError}</p>
        </div>
      )}

      <div className="banner banner--compact">
        <p>
          <strong>Preview</strong> — Drag on the canvas to add or erase mask pixels. Use{" "}
          <em>Use edited mask</em> to upload the PNG, then approve the revision.
        </p>
      </div>

      {detection && (
        <section className="panel">
          <h2 className="panel__title">Detection</h2>
          <dl className="kv">
            <div>
              <dt>Part</dt>
              <dd>{detection.part_class.replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{(detection.confidence * 100).toFixed(1)}%</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">Mask over capture frame</h2>
        <MaskOverlayEditor
          frameUrl={capture?.frame_uri || ""}
          maskUrl={(maskUri || detection?.raw_mask_uri || "").trim()}
          onMaskUri={applyMaskUriFromUpload}
          onBrushDirtyChange={setMaskBrushDirty}
          disabled={!detection || !capture}
          busy={busy}
        />
      </section>

      <section className="panel">
        <h2 className="panel__title">Revision record</h2>
        <div className="form">
          <label className="field">
            <span className="field__label">Mask artifact URI</span>
            <input className="field__input mono" readOnly value={maskUri || "—"} />
            <span className="field__hint">
              YOLO export path, or an uploaded{" "}
              <span className="mono">edited_*.png</span> after editing.
            </span>
          </label>
          <label className="field">
            <span className="field__label">Operator notes</span>
            <textarea
              className="field__input field__textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="QA context, deviations, traceability"
            />
          </label>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn"
            disabled={busy || !detection || !!revision}
            onClick={() => submitMask()}
          >
            {revision ? "Revision approved ✓" : "Approve mask revision"}
          </button>
        </div>
        <p className="help">
          {revision
            ? `Revision #${revision.id} recorded.`
            : "No approved revision yet."}
        </p>
      </section>

      {revision && (
        <div className="step-footer">
          <span className="step-footer__hint">
            Revision #{revision.id} approved.
          </span>
          <button type="button" className="btn" onClick={onContinue}>
            Continue to Execute →
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — Execute                                                     */
/* ------------------------------------------------------------------ */

function StepExecute() {
  const {
    session,
    detection,
    revision,
    paintJob,
    createAndExecuteJob,
    cancelJob,
    busy,
    operatorStatus,
    paintProgress,
    flowError,
  } = useWorkbench();

  const barPercent =
    operatorStatus?.sim_state === "PAINT" &&
    operatorStatus?.paint &&
    typeof operatorStatus.paint.percent === "number"
      ? operatorStatus.paint.percent
      : paintProgress;

  const ready = !!(session && detection && revision);
  const webotsPainting = operatorStatus?.sim_state === "PAINT";

  return (
    <div className="step-content fade-in">
      {flowError && (
        <div className="banner banner--error">
          <p>{flowError}</p>
        </div>
      )}

      <section className="panel">
        <h2 className="panel__title">Prerequisites</h2>
        <ul className="checklist">
          <li className={session ? "ok" : ""}>Active session</li>
          <li className={detection ? "ok" : ""}>Detection locked</li>
          <li className={revision ? "ok" : ""}>Approved mask revision</li>
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel__title">Execute</h2>
        <div className="page__actions">
          <button
            type="button"
            className="btn"
            disabled={busy || !ready}
            onClick={() => createAndExecuteJob()}
          >
            Execute paint job
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy || (!paintJob && !webotsPainting)}
            onClick={() => cancelJob()}
          >
            Cancel job
          </button>
        </div>
        <p className="help mono">Status: {paintJob?.status ?? "idle"}</p>
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={barPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress__fill" style={{ width: `${barPercent}%` }} />
        </div>
        <p className="help">
          Progress {barPercent}%
          {operatorStatus?.sim_state === "PAINT" ? " · Webots PAINT" : " · API / idle"}
        </p>
      </section>
    </div>
  );
}
