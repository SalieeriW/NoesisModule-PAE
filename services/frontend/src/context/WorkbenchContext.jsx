import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  apiUrl,
  cancelPaintJob,
  closeSession,
  createCapture,
  createDetection,
  createMaskRevision,
  createPaintJob,
  executePaintJob,
  fetchRuntimeStatus,
  listMaskRevisionsForDetection,
  maskDisplayUrl,
  simCapture,
  simDetect,
  simStart,
  simStop,
  startSession
} from "../lib/api";
import { isValidVinOrDemo } from "../lib/validation";
import { useOperator } from "./OperatorContext";

const WorkbenchContext = createContext(null);

export function WorkbenchProvider({ children }) {
  const { activeOperator } = useOperator();
  const operatorApiId = activeOperator?.id ?? "";

  const [session, setSession] = useState(null);
  const [capture, setCapture] = useState(null);
  const [detection, setDetection] = useState(null);
  const [revision, setRevision] = useState(null);
  const [paintJob, setPaintJob] = useState(null);
  const [events, setEvents] = useState([]);
  const [runtimeStatus, setRuntimeStatus] = useState("stopped");
  const [vin, setVin] = useState("");
  const [maskUri, setMaskUri] = useState("");
  const [maskBrushDirty, setMaskBrushDirty] = useState(false);
  const [notes, setNotes] = useState("");
  const [paintColor, setPaintColor] = useState("#F5F5F5");
  const [busy, setBusy] = useState(false);
  const [simDetections, setSimDetections] = useState([]);
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState(0);
  const [paintProgress, setPaintProgress] = useState(0);
  const [operatorStatus, setOperatorStatus] = useState(null);
  const [flowError, setFlowError] = useState("");
  const [milestones, setMilestones] = useState([]);
  /** Bumps when the operator uploads an edited mask so an in-flight revision fetch cannot overwrite it. */
  const maskUploadEpochRef = useRef(0);

  const pushMilestone = useCallback((entry) => {
    setMilestones((prev) => {
      const row = {
        ...entry,
        id: globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}`,
        ts: Date.now()
      };
      return [row, ...prev].slice(0, 120);
    });
  }, []);

  const wsUrl = useMemo(() => {
    const explicit = import.meta.env.VITE_WS_URL;
    if (explicit != null && String(explicit).trim() !== "") {
      return String(explicit).trim();
    }
    if (typeof window === "undefined") {
      return "ws://localhost:8080/api/v1/ws/events";
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/v1/ws/events`;
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload?.type === "paint.progress") {
        const value = Number(payload?.payload?.progress_percent || 0);
        setPaintProgress(Number.isFinite(value) ? value : 0);
      }
      if (payload?.type === "paint.completed") {
        setPaintProgress(100);
      }
      setEvents((prev) => [payload, ...prev].slice(0, 100));
    };
    return () => ws.close();
  }, [wsUrl]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await fetchRuntimeStatus();
        if (!cancelled) setOperatorStatus(st);
      } catch {
        if (!cancelled) setOperatorStatus(null);
      }
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setMaskBrushDirty(false);
    const id = detection?.id;
    const raw = detection?.raw_mask_uri;
    if (id == null || !raw) {
      setMaskUri("");
      return;
    }
    const epochAtFetchStart = maskUploadEpochRef.current;
    let cancelled = false;
    (async () => {
      let next = raw;
      try {
        const revs = await listMaskRevisionsForDetection(id);
        if (!cancelled && Array.isArray(revs) && revs.length > 0) {
          const last = revs[revs.length - 1];
          if (last?.mask_uri) next = last.mask_uri;
        }
      } catch {
        /* keep YOLO mask */
      }
      if (
        !cancelled &&
        epochAtFetchStart === maskUploadEpochRef.current
      ) {
        setMaskUri(maskDisplayUrl(next));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detection?.id, detection?.raw_mask_uri]);

  const applyMaskUriFromUpload = useCallback((uri) => {
    maskUploadEpochRef.current += 1;
    setMaskUri(uri);
  }, []);

  const resetJobState = useCallback(() => {
    maskUploadEpochRef.current = 0;
    setCapture(null);
    setDetection(null);
    setRevision(null);
    setPaintJob(null);
    setSimDetections([]);
    setSelectedDetectionIndex(0);
    setPaintProgress(0);
    setFlowError("");
    setNotes("");
  }, []);

  const withBusy = useCallback(async (fn) => {
    try {
      setBusy(true);
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const startRuntime = useCallback(async () => {
    await withBusy(async () => {
      await simStart();
      setRuntimeStatus("running");
    });
  }, [withBusy]);

  const stopRuntime = useCallback(async () => {
    await withBusy(async () => {
      await simStop();
      setRuntimeStatus("stopped");
    });
  }, [withBusy]);

  const beginFlow = useCallback(async () => {
    setFlowError("");
    if (!operatorApiId) {
      setFlowError("Select a signed-in operator before starting a session.");
      return;
    }
    if (!isValidVinOrDemo(vin)) {
      setFlowError("Enter a valid 17-character VIN or a DEMO-… id for lab use.");
      return;
    }
    const vinPayload = vin.trim().toUpperCase();
    try {
      await withBusy(async () => {
        const s = await startSession({
          workcell_id: 1,
          operator_id: operatorApiId,
          vin: vinPayload
        });
        setSession(s);
        pushMilestone({
          kind: "session",
          title: "Session opened",
          detail: `#${s.id} · VIN ${vinPayload}`
        });
        let simCap;
        try {
          simCap = await simCapture();
        } catch (e) {
          throw new Error(
            "Capture failed — is Webots running with viewport feed? " + String(e?.message || e)
          );
        }
        const c = await createCapture({
          session_id: s.id,
          frame_uri: apiUrl(simCap.frame_uri),
          depth_uri: simCap.depth_uri,
          camera_pose: simCap.camera_pose || {},
          intrinsics: simCap.intrinsics || {}
        });
        setCapture(c);
        pushMilestone({
          kind: "capture",
          title: "Viewport capture stored",
          detail: `Capture #${c.id}`
        });
        const dets = await simDetect();
        setSimDetections(dets);
        setSelectedDetectionIndex(0);
        if (!dets.length) {
          pushMilestone({
            kind: "detection",
            title: "No YOLO candidates",
            detail: "Check camera view or model classes"
          });
          return;
        }
        const best = dets[0];
        const d = await createDetection({
          capture_id: c.id,
          part_class: best.part_class,
          confidence: best.confidence,
          bbox: best.bbox,
          raw_mask_uri: apiUrl(best.raw_mask_uri)
        });
        setDetection(d);
        pushMilestone({
          kind: "detection",
          title: "Detection recorded",
          detail: `${best.part_class} · ${(best.confidence * 100).toFixed(0)}%`
        });
      });
    } catch (e) {
      setFlowError(String(e?.message || e));
    }
  }, [operatorApiId, vin, withBusy, pushMilestone]);

  const applySelectedDetection = useCallback(async () => {
    if (!capture || !simDetections.length || !operatorApiId) return;
    const selected = simDetections[selectedDetectionIndex] || simDetections[0];
    await withBusy(async () => {
      const d = await createDetection({
        capture_id: capture.id,
        part_class: selected.part_class,
        confidence: selected.confidence,
        bbox: selected.bbox,
        raw_mask_uri: apiUrl(selected.raw_mask_uri)
      });
      setDetection(d);
      pushMilestone({
        kind: "detection",
        title: "Part selection updated",
        detail: `${selected.part_class} · ${(selected.confidence * 100).toFixed(0)}%`
      });
    });
  }, [capture, simDetections, selectedDetectionIndex, operatorApiId, withBusy, pushMilestone]);

  const submitMask = useCallback(async () => {
    if (!detection || !operatorApiId) return;
    if (maskBrushDirty) {
      setFlowError(
        "Brush edits are not saved yet — click “Use edited mask” to upload the PNG, then approve."
      );
      return;
    }
    const uri = (maskUri || detection.raw_mask_uri || "").trim();
    if (!uri) {
      setFlowError("No mask URI available from detection.");
      return;
    }
    await withBusy(async () => {
      const r = await createMaskRevision({
        detection_id: detection.id,
        mask_uri: uri,
        author_id: operatorApiId,
        notes
      });
      setRevision(r);
      setFlowError("");
      setMaskBrushDirty(false);
      pushMilestone({
        kind: "mask",
        title: "Mask revision approved",
        detail: `Revision #${r.id} · ${detection.part_class}`
      });
    });
  }, [detection, maskBrushDirty, maskUri, notes, operatorApiId, withBusy, pushMilestone]);

  const createAndExecuteJob = useCallback(async () => {
    if (!session || !detection || !revision || !operatorApiId) return;
    await withBusy(async () => {
      const job = await createPaintJob({
        session_id: session.id,
        detection_id: detection.id,
        approved_revision_id: revision.id,
        created_by: operatorApiId,
        params: { color: paintColor, part_class: detection.part_class }
      });
      setPaintProgress(0);
      setPaintJob(job);
      const running = await executePaintJob(job.id);
      setPaintJob(running);
      pushMilestone({
        kind: "paint",
        title: "Paint job dispatched",
        detail: `Job #${job.id} · ${running?.status ?? "running"}`
      });
    });
  }, [session, detection, revision, operatorApiId, paintColor, withBusy, pushMilestone]);

  const cancelJob = useCallback(async () => {
    if (!paintJob) return;
    await withBusy(async () => {
      const updated = await cancelPaintJob(paintJob.id);
      setPaintJob(updated);
      pushMilestone({
        kind: "paint",
        title: "Paint job cancelled",
        detail: `Job #${paintJob.id}`
      });
    });
  }, [paintJob, withBusy, pushMilestone]);

  const endSession = useCallback(async () => {
    if (!session) return;
    await withBusy(async () => {
      try {
        await closeSession(session.id);
      } catch (e) {
        setFlowError(String(e?.message || e));
        return;
      }
      pushMilestone({
        kind: "session",
        title: "Session closed",
        detail: `Session #${session.id}`
      });
      setSession(null);
      resetJobState();
    });
  }, [session, withBusy, resetJobState, pushMilestone]);

  const value = useMemo(
    () => ({
      session,
      capture,
      detection,
      revision,
      paintJob,
      events,
      runtimeStatus,
      vin,
      setVin,
      maskUri,
      applyMaskUriFromUpload,
      maskBrushDirty,
      setMaskBrushDirty,
      notes,
      setNotes,
      busy,
      simDetections,
      selectedDetectionIndex,
      setSelectedDetectionIndex,
      paintProgress,
      operatorStatus,
      flowError,
      setFlowError,
      paintColor,
      setPaintColor,
      startRuntime,
      stopRuntime,
      beginFlow,
      applySelectedDetection,
      submitMask,
      createAndExecuteJob,
      cancelJob,
      endSession,
      milestones
    }),
    [
      session,
      capture,
      detection,
      revision,
      paintJob,
      events,
      runtimeStatus,
      vin,
      maskUri,
      applyMaskUriFromUpload,
      maskBrushDirty,
      notes,
      busy,
      simDetections,
      selectedDetectionIndex,
      paintProgress,
      operatorStatus,
      flowError,
      paintColor,
      startRuntime,
      stopRuntime,
      beginFlow,
      applySelectedDetection,
      submitMask,
      createAndExecuteJob,
      cancelJob,
      endSession,
      milestones
    ]
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error("useWorkbench must be used under WorkbenchProvider");
  return ctx;
}
