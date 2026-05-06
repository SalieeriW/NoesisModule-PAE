#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080/api/v1}"

echo "Starting MVP smoke flow against ${API_BASE}"

SESSION_JSON=$(curl -sS -X POST "${API_BASE}/sessions" \
  -H "Content-Type: application/json" \
  -d '{"workcell_id":1,"operator_id":"op-1","vin":"VIN-SMOKE-001"}')
SESSION_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "${SESSION_JSON}")
echo "Session: ${SESSION_ID}"

CAPTURE_JSON=$(curl -sS -X POST "${API_BASE}/captures" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":${SESSION_ID},\"frame_uri\":\"s3://paint-artifacts/captures/latest.png\",\"depth_uri\":\"s3://paint-artifacts/captures/latest_depth.npy\",\"camera_pose\":{},\"intrinsics\":{}}")
CAPTURE_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "${CAPTURE_JSON}")
echo "Capture: ${CAPTURE_ID}"

DETECTION_JSON=$(curl -sS -X POST "${API_BASE}/detections" \
  -H "Content-Type: application/json" \
  -d "{\"capture_id\":${CAPTURE_ID},\"part_class\":\"front_left_door\",\"confidence\":0.9,\"bbox\":{\"x\":1,\"y\":2,\"w\":3,\"h\":4},\"raw_mask_uri\":\"s3://paint-artifacts/masks/front_left_door.png\"}")
DETECTION_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "${DETECTION_JSON}")
echo "Detection: ${DETECTION_ID}"

REVISION_JSON=$(curl -sS -X POST "${API_BASE}/masks/revisions" \
  -H "Content-Type: application/json" \
  -d "{\"detection_id\":${DETECTION_ID},\"mask_uri\":\"s3://paint-artifacts/masks/front_left_door_edited.png\",\"author_id\":\"op-1\"}")
REVISION_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "${REVISION_JSON}")
echo "Revision: ${REVISION_ID}"

JOB_JSON=$(curl -sS -X POST "${API_BASE}/paint-jobs" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":${SESSION_ID},\"detection_id\":${DETECTION_ID},\"approved_revision_id\":${REVISION_ID},\"created_by\":\"op-1\",\"params\":{\"color\":\"white\"}}")
JOB_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "${JOB_JSON}")
echo "Paint Job: ${JOB_ID}"

curl -sS -X POST "${API_BASE}/paint-jobs/${JOB_ID}/execute" -H "Content-Type: application/json" -d '{}' >/dev/null
echo "Paint job execute submitted."

curl -sS -X POST "${API_BASE}/sessions/${SESSION_ID}/close" -H "Content-Type: application/json" -d '{}' >/dev/null
echo "Session closed."

echo "Smoke flow completed successfully."
