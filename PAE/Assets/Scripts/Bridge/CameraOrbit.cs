using System;
using System.IO;
using System.Net;
using UnityEngine;

/// <summary>
/// Handles POST /api/camera (orbit/zoom commands from sim-service).
/// Attach to the viewport Camera GameObject alongside MjpegStreamer.
///
/// Setup:
///   1. Attach to the viewport Camera.
///   2. Assign target to the car or scene pivot.
///   3. Assign this component to BridgeServer.cameraOrbit.
/// </summary>
public class CameraOrbit : MonoBehaviour
{
    [Tooltip("The point the camera orbits around (e.g. the car root transform).")]
    public Transform target;

    public float orbitSensitivity = 1.0f;
    public float zoomSensitivity = 1.0f;
    [Range(0.5f, 50f)]
    public float initialDistance = 5f;

    private float _yaw;
    private float _pitch = 20f;
    private float _distance;

    // Pending delta applied on next LateUpdate (set from background thread).
    private float _pendingDx;
    private float _pendingDy;
    private float _pendingZoom;
    private readonly object _deltaLock = new object();

    void Start()
    {
        _distance = initialDistance;
        if (target != null)
            _distance = Vector3.Distance(transform.position, target.position);
    }

    void LateUpdate()
    {
        if (target == null) return;

        float dx, dy, zoom;
        lock (_deltaLock)
        {
            dx = _pendingDx; dy = _pendingDy; zoom = _pendingZoom;
            _pendingDx = _pendingDy = _pendingZoom = 0f;
        }

        _yaw += dx * orbitSensitivity;
        _pitch -= dy * orbitSensitivity;
        _pitch = Mathf.Clamp(_pitch, -89f, 89f);
        _distance = Mathf.Clamp(_distance + zoom * zoomSensitivity, 0.5f, 50f);

        var rot = Quaternion.Euler(_pitch, _yaw, 0f);
        transform.position = target.position + rot * new Vector3(0f, 0f, -_distance);
        transform.rotation = rot;
    }

    public void HandleCamera(HttpListenerContext ctx)
    {
        string body;
        using (var reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            body = reader.ReadToEnd();

        CameraCommand cmd;
        try { cmd = JsonUtility.FromJson<CameraCommand>(body); }
        catch (Exception)
        {
            BridgeServer.RespondJson(ctx.Response, 400, "{\"error\":\"invalid json\"}");
            return;
        }

        lock (_deltaLock)
        {
            _pendingDx += cmd.dx;
            _pendingDy += cmd.dy;
            _pendingZoom += cmd.zoom;
        }

        BridgeServer.RespondJson(ctx.Response, 200, "{\"ok\":true}");
    }
}
