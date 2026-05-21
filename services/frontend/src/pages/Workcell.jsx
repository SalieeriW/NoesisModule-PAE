import { useState } from "react";
import { ColorPad } from "../components/ColorPad";
import { MaskOverlayEditor } from "../components/MaskOverlayEditor";
import { MiniViewport } from "../components/MiniViewport";
import { useWorkbench } from "../context/WorkbenchContext";
import { chatCommand } from "../lib/api";

const STEPS = [
  { id: 0, label: "Scan" },
  { id: 1, label: "Mask" },
  { id: 2, label: "Paint" },
];

export function Workcell() {
  const { detection, revision, paintJob, paintProgress, endSession } = useWorkbench();
  const maxStep = detection ? (revision ? 2 : 1) : 0;
  const [step, setStep] = useState(0);

  const isDone =
    paintJob?.status === "completed" ||
    paintJob?.status === "done" ||
    (paintProgress >= 100 && !!paintJob);

  async function handleNewJob() {
    await endSession();
    setStep(0);
  }

  return (
    <div className="page fade-in">
      <WfStepper steps={STEPS} current={step} max={maxStep} onChange={setStep} />
      {step === 0 && <StepScan onNext={() => setStep(1)} />}
      {step === 1 && <StepMask onNext={() => setStep(2)} />}
      {step === 2 && <StepPaint isDone={isDone} onNewJob={handleNewJob} />}
    </div>
  );
}

/* ── Stepper ──────────────────────────────────────────────────────── */

function WfStepper({ steps, current, max, onChange }) {
  return (
    <div className="wf-stepper">
      {steps.map((s, i) => {
        const done = s.id < current;
        const active = s.id === current;
        const locked = s.id > max;
        return (
          <div key={s.id} style={{ display: "contents" }}>
            <button
              className={[
                "wf-step",
                active && "wf-step--active",
                done && "wf-step--done",
                locked && "wf-step--locked",
              ].filter(Boolean).join(" ")}
              disabled={locked}
              onClick={() => !locked && onChange(s.id)}
            >
              <span className="wf-step__circle">{done ? "✓" : s.id + 1}</span>
              <span className="wf-step__label">{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={`wf-connector${done ? " wf-connector--done" : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Shared helpers ────────────────────────────────────────────────── */

function ErrBanner({ children }) {
  return (
    <div className="banner banner--error banner--compact"><p>{children}</p></div>
  );
}

function Chip({ ok, warn, paint, children }) {
  const mod = ok ? "chip--ok" : warn ? "chip--warn" : paint ? "chip--paint" : "chip--neutral";
  return <span className={`chip ${mod}`}>{children}</span>;
}

/* ═══════════════════════════════════════════════════════════════════
   Step 1 — Scan & detect (with live viewport sidebar)
   ═══════════════════════════════════════════════════════════════════ */

const COLOR_ALIASES = {
  blanco: "#f5f5f5", negro: "#1a1a1a", plata: "#c0c0c0", plateado: "#c0c0c0",
  gris: "#6b7280", rojo: "#dc2626", azul: "#2563eb", verde: "#16a34a",
  amarillo: "#eab308", naranja: "#ea580c", beige: "#d4b896",
  white: "#f5f5f5", black: "#1a1a1a", silver: "#c0c0c0", gray: "#6b7280",
  red: "#dc2626", blue: "#2563eb", green: "#16a34a", yellow: "#eab308",
  orange: "#ea580c",
  blanc: "#f5f5f5", noir: "#1a1a1a", rouge: "#dc2626", bleu: "#2563eb",
  vert: "#16a34a", jaune: "#eab308",
};

function normalizeColorToHex(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (COLOR_ALIASES[lower]) return COLOR_ALIASES[lower];
  if (/^#[0-9a-f]{6}$/i.test(lower)) return lower;
  return null;
}

function StepScan({ onNext }) {
  const {
    session, vin, setVin, simDetections, detection,
    beginFlow, redetect, applySelectedDetection,
    busy, runtimeStatus, flowError, setFlowError,
    selectedColor, setSelectedColor,
  } = useWorkbench();

  const [nlInput, setNlInput] = useState("");
  const [nlFeedback, setNlFeedback] = useState(null);
  const [nlBusy, setNlBusy] = useState(false);

  const runtimeOk = runtimeStatus === "running";

  // selectedColor is a hex string when set from pad, or a name string when set from AI
  // normalizeColorToHex ensures the pad always gets a valid hex
  const colorHex = normalizeColorToHex(selectedColor) ?? selectedColor;

  async function handleBegin() {
    setFlowError("");
    setNlFeedback(null);
    await beginFlow();
  }

  async function handleNl(e) {
    e.preventDefault();
    const text = nlInput.trim();
    if (!text || nlBusy) return;
    setNlBusy(true);
    setNlFeedback(null);
    try {
      const res = await chatCommand(text, []);
      if (res.clarification_needed) {
        setNlFeedback({ ok: false, text: `Clarify: ${res.clarification_question}` });
        return;
      }
      const piece = res.command?.target?.piece;
      const rawColor = res.command?.parameters?.color;
      const feedbackParts = [];

      if (rawColor) {
        const hex = normalizeColorToHex(rawColor);
        if (hex) {
          setSelectedColor(hex);
          feedbackParts.push(`color → ${rawColor}`);
        }
      }

      if (piece && simDetections.length > 0) {
        const idx = simDetections.findIndex((d) => d.part_class === piece);
        if (idx >= 0) {
          await applySelectedDetection(idx);
          feedbackParts.push(`part → ${piece.replace(/_/g, " ")}`);
          setNlInput("");
          setNlFeedback({ ok: true, text: `✓ ${feedbackParts.join(" · ")}` });
          setTimeout(() => onNext(), 600);
          return;
        } else {
          feedbackParts.push(`"${piece.replace(/_/g, " ")}" not detected — tap a card`);
        }
      } else if (piece && simDetections.length === 0) {
        feedbackParts.push("scan first, then describe the part");
      }

      if (feedbackParts.length > 0) {
        setNlFeedback({ ok: !piece || simDetections.length === 0, text: feedbackParts.join(" · ") });
      } else {
        setNlFeedback({ ok: false, text: 'Could not understand — try: "paint the front bumper red"' });
      }
      setNlInput("");
    } catch {
      setNlFeedback({ ok: false, text: "Assistant unavailable — tap a card manually." });
    } finally {
      setNlBusy(false);
    }
  }

  async function handleCardSelect(idx) {
    await applySelectedDetection(idx);
    onNext();
  }

  return (
    <div className="wf-content fade-in">
      {flowError && <ErrBanner>{flowError}</ErrBanner>}

      {/* ── Viewport strip ── */}
      <div className="scan-vp-strip">
        <MiniViewport showControls />
      </div>

      {/* ── Vehicle ID + scan button ── */}
      <div className="wf-scan-card">
        <div className="wf-scan-card__row wf-scan-card__row--top">
          <label className="field" style={{ flex: 1 }}>
            <span className="field__label">Vehicle ID</span>
            <input
              className="field__input wf-vin-input"
              value={vin}
              onChange={(e) => { setFlowError(""); setVin(e.target.value.toUpperCase()); }}
              placeholder="17-char VIN or DEMO-LAB01"
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <div className="wf-scan-card__actions">
            <button
              className="btn btn--lg"
              disabled={busy || !!session || !runtimeOk}
              onClick={handleBegin}
            >
              {busy ? "Scanning…" : "Scan & Detect"}
            </button>
            {session && (
              <button className="btn btn--ghost" disabled={busy}
                onClick={() => { setNlFeedback(null); redetect(); }}>
                Re-scan
              </button>
            )}
          </div>
        </div>
        {session && (
          <div className="chip-row">
            <Chip ok>Session #{session.id}</Chip>
          </div>
        )}
      </div>

      {/* ── AI Command Panel ── */}
      <div className="ai-panel">
        <div className="ai-panel__header">
          <span className="ai-panel__title">AI Assistant</span>
          <span className="ai-panel__hint">Describe what to paint in natural language</span>
        </div>

        <form className="ai-panel__input-row" onSubmit={handleNl}>
          <input
            className="ai-panel__input"
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder='e.g. "paint the front bumper red" or "left door in blue"'
            disabled={nlBusy || busy}
            autoComplete="off"
          />
          <button
            className="btn btn--lg ai-panel__send"
            type="submit"
            disabled={nlBusy || busy || !nlInput.trim()}
          >
            {nlBusy ? "…" : "Send"}
          </button>
        </form>

        {nlFeedback && (
          <p className={`ai-panel__feedback ai-panel__feedback--${nlFeedback.ok ? "ok" : "err"}`}>
            {nlFeedback.text}
          </p>
        )}

        {/* Color selection */}
        <div className="ai-panel__color-section">
          <div className="ai-panel__color-label">Paint color</div>
          <ColorPad
            value={colorHex}
            onChange={setSelectedColor}
            disabled={busy}
          />
        </div>
      </div>

      {/* ── Detection results ── */}
      {simDetections.length > 0 && (
        <div className="wf-results fade-in">
          <p className="wf-results__heading">
            {simDetections.length} part{simDetections.length !== 1 ? "s" : ""} detected — tap to select
          </p>
          <div className="part-grid">
            {simDetections.map((d, idx) => {
              const active = detection?.part_class === d.part_class;
              return (
                <button
                  key={idx}
                  className={`part-card${active ? " part-card--active" : ""}`}
                  onClick={() => handleCardSelect(idx)}
                  disabled={busy}
                >
                  <span className="part-card__name">{d.part_class.replace(/_/g, " ")}</span>
                  <span className="part-card__conf">{(d.confidence * 100).toFixed(0)}%</span>
                  {active && <span className="part-card__check" aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {simDetections.length === 0 && session && !busy && (
        <p className="wf-empty">No parts detected. Check the viewport and re-scan.</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Step 2 — Mask review
   ═══════════════════════════════════════════════════════════════════ */

function StepMask({ onNext }) {
  const {
    capture, detection, maskUri, applyMaskUriFromUpload,
    setMaskBrushDirty, notes, setNotes, submitMask, revision, busy, flowError,
  } = useWorkbench();

  return (
    <div className="wf-content fade-in">
      {flowError && <ErrBanner>{flowError}</ErrBanner>}

      <div className="chip-row">
        {detection && (
          <>
            <Chip ok>{detection.part_class.replace(/_/g, " ")}</Chip>
            <Chip>{(detection.confidence * 100).toFixed(0)}% confidence</Chip>
          </>
        )}
        {revision && <Chip ok>Revision #{revision.id} approved</Chip>}
      </div>

      <MaskOverlayEditor
        frameUrl={capture?.frame_uri || ""}
        maskUrl={(maskUri || detection?.raw_mask_uri || "").trim()}
        onMaskUri={applyMaskUriFromUpload}
        onBrushDirtyChange={setMaskBrushDirty}
        disabled={!detection || !capture}
        busy={busy}
      />

      <div className="wf-mask-footer">
        <textarea
          className="field__input field__textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Operator notes (optional)"
          style={{ resize: "none", flex: 1, minWidth: 0 }}
        />
        {!revision ? (
          <button className="btn btn--lg" disabled={busy || !detection} onClick={() => submitMask()}>
            {busy ? "Approving…" : "Approve mask"}
          </button>
        ) : (
          <button className="btn btn--lg" onClick={onNext}>
            Continue to Paint →
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Step 3 — Execute
   ═══════════════════════════════════════════════════════════════════ */

function StepPaint({ isDone, onNewJob }) {
  const {
    session, detection, revision, paintJob,
    createAndExecuteJob, cancelJob, busy,
    operatorStatus, paintProgress, flowError,
    selectedColor,
  } = useWorkbench();

  const barPercent =
    operatorStatus?.sim_state === "PAINT" &&
    typeof operatorStatus.paint?.percent === "number"
      ? operatorStatus.paint.percent
      : paintProgress;

  const ready = !!(session && detection && revision);
  const isPainting = !isDone && (paintJob?.status === "running" || operatorStatus?.sim_state === "PAINT");
  const simState = operatorStatus?.sim_state ?? "—";

  return (
    <div className="wf-content fade-in">
      {flowError && <ErrBanner>{flowError}</ErrBanner>}

      {/* Live viewport */}
      <div className="scan-vp-strip">
        <MiniViewport showControls />
      </div>

      {/* Job info grid */}
      <div className="wf-paint-info">
        <div className="wf-paint-info__cell">
          <span className="wf-paint-info__label">Session</span>
          <span className="wf-paint-info__value mono">{session ? `#${session.id}` : "—"}</span>
        </div>
        <div className="wf-paint-info__cell">
          <span className="wf-paint-info__label">Part</span>
          <span className="wf-paint-info__value">{detection ? detection.part_class.replace(/_/g, " ") : "—"}</span>
        </div>
        <div className="wf-paint-info__cell">
          <span className="wf-paint-info__label">Mask rev</span>
          <span className="wf-paint-info__value mono">{revision ? `#${revision.id}` : "—"}</span>
        </div>
        <div className="wf-paint-info__cell">
          <span className="wf-paint-info__label">Job</span>
          <span className="wf-paint-info__value mono">{paintJob ? `#${paintJob.id}` : "—"}</span>
        </div>
        <div className="wf-paint-info__cell">
          <span className="wf-paint-info__label">Color</span>
          <span className="wf-paint-info__value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {(() => {
              const c = paintJob?.params?.color ?? selectedColor;
              return (
                <>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                  <span className="mono" style={{ fontSize: 12 }}>{c || "—"}</span>
                </>
              );
            })()}
          </span>
        </div>
        <div className="wf-paint-info__cell">
          <span className="wf-paint-info__label">Sim state</span>
          <span className="wf-paint-info__value">
            <Chip ok={simState === "PAINT"} warn={simState === "—"} paint={simState === "PAINT"}>
              {simState}
            </Chip>
          </span>
        </div>
      </div>

      {/* Progress + actions */}
      <div className="wf-paint-card">
        {isDone ? (
          <>
            <div className="wf-paint-done">
              <span className="wf-paint-done__check">✓</span>
              <div>
                <p className="wf-paint-done__title">Paint job complete</p>
                <p className="wf-paint-done__detail">
                  Job #{paintJob?.id} · {detection?.part_class?.replace(/_/g, " ")}
                </p>
              </div>
            </div>
            <div className="paint-bar">
              <div className="paint-bar__fill paint-bar__fill--done" style={{ width: "100%" }} />
            </div>
            <button
              className="btn btn--lg wf-paint-btn"
              disabled={busy}
              onClick={onNewJob}
            >
              {busy ? "Closing…" : "Close session & start new job"}
            </button>
          </>
        ) : isPainting ? (
          <>
            <div className="wf-paint-progress-header">
              <span className="wf-paint-label">Painting in progress</span>
              <span className="wf-paint-pct">{barPercent}%</span>
            </div>
            <div className="paint-bar">
              <div className="paint-bar__fill" style={{ width: `${barPercent}%` }} />
            </div>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => cancelJob()}>
              Cancel job
            </button>
          </>
        ) : (
          <>
            <div className="chip-row">
              <Chip ok={!!session} warn={!session}>Session</Chip>
              <Chip ok={!!detection} warn={!detection}>Detection</Chip>
              <Chip ok={!!revision} warn={!revision}>Mask approved</Chip>
            </div>
            <button
              className="btn btn--lg wf-paint-btn"
              disabled={busy || !ready}
              onClick={() => createAndExecuteJob()}
            >
              Execute paint job
            </button>
          </>
        )}
      </div>
    </div>
  );
}
