import { MaskOverlayEditor } from "../components/MaskOverlayEditor";
import { useWorkbench } from "../context/WorkbenchContext";

export function MaskReview() {
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
    flowError
  } = useWorkbench();

  return (
    <div className="page fade-in">
      <header className="page__hero">
        <h1 className="page__title">Mask approval</h1>
        <p className="page__lede">
          The orange overlay follows your <strong>approved mask PNG</strong> (YOLO export or
          edited upload) on the viewport frame. 3D spray in Webots uses that same file for
          coverage; world-space dots will not match pixels exactly, but they should follow the
          region you edited—not a fresh YOLO re-run.
        </p>
      </header>

      <div className="banner banner--compact">
        <p>
          <strong>Preview</strong> — Drag on the canvas to add or erase mask pixels. Use{" "}
          <em>Use edited mask</em> to upload a PNG to the workcell cache, then approve the
          revision.
        </p>
      </div>

      {flowError && (
        <div className="banner banner--error">
          <p>{flowError}</p>
        </div>
      )}

      {!detection && (
        <div className="banner banner--warn">
          <p>Complete inspection first to attach a detection and mask.</p>
        </div>
      )}

      {detection && (
        <section className="panel">
          <h2 className="panel__title">Detection</h2>
          <dl className="kv">
            <div>
              <dt>Part</dt>
              <dd>{detection.part_class}</dd>
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
              YOLO export path, or an uploaded <span className="mono">edited_*.png</span> after
              editing.
            </span>
          </label>
          <label className="field">
            <span className="field__label">Operator notes</span>
            <textarea
              className="field__input field__textarea"
              rows={4}
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
            disabled={busy || !detection}
            onClick={() => submitMask()}
          >
            Approve mask revision
          </button>
        </div>
        <p className="help">
          {revision
            ? `Revision #${revision.id} recorded. Proceed to Production.`
            : "No approved revision yet."}
        </p>
      </section>
    </div>
  );
}
