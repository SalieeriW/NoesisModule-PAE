import { useState } from "react";

export function MaskEditor({ onSave }) {
  const [maskUri, setMaskUri] = useState("s3://paint-artifacts/masks/edited-mask.png");
  const [notes, setNotes] = useState("");

  return (
    <section className="panel">
      <h3>Mask Edit</h3>
      <p>POC editor placeholder: upload or paste the edited bitmap URI.</p>
      <input value={maskUri} onChange={(e) => setMaskUri(e.target.value)} />
      <textarea
        placeholder="Operator notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button onClick={() => onSave(maskUri, notes)}>Submit Revision</button>
    </section>
  );
}
