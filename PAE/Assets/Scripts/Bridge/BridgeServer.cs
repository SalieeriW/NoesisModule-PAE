using System;
using System.Net;
using System.Text;
using System.Threading;
using UnityEngine;

/// <summary>
/// HTTP bridge that connects the Docker stack (sim-service) to the Unity scene.
/// Listens on http://+:{port}/ and routes requests to the component handlers.
///
/// Setup in the Unity scene:
///   1. Create an empty GameObject named "Bridge".
///   2. Add components: BridgeServer, UnityMainThread, MjpegStreamer (on camera), PaintExecutor, CameraOrbit.
///   3. In BridgeServer inspector, assign mjpegStreamer, paintExecutor, cameraOrbit.
///   4. On first use (Windows), run once as admin:
///        netsh http add urlacl url=http://+:8082/ user=Everyone
///
/// Endpoints:
///   GET  /api/viewport/stream  — MJPEG live feed consumed by sim-service
///   GET  /api/viewport/meta    — {"width", "height", "fov_h"}
///   POST /api/paint            — paint job command from sim-service
///   POST /api/camera           — camera orbit command from sim-service
///   GET  /api/status           — operator status polled by sim-service
/// </summary>
public class BridgeServer : MonoBehaviour
{
    [Header("Network")]
    public int port = 8082;

    [Header("Component References")]
    public MjpegStreamer mjpegStreamer;
    public PaintExecutor paintExecutor;
    public CameraOrbit cameraOrbit;

    private HttpListener _listener;
    private Thread _listenerThread;
    private volatile bool _running;

    void Start()
    {
        _listener = new HttpListener();
        _listener.Prefixes.Add($"http://+:{port}/");
        try
        {
            _listener.Start();
        }
        catch (HttpListenerException ex)
        {
            Debug.LogError(
                $"[BridgeServer] Failed to start on port {port}: {ex.Message}\n" +
                $"Run once as admin: netsh http add urlacl url=http://+:{port}/ user=Everyone");
            return;
        }

        _running = true;
        _listenerThread = new Thread(ListenerLoop) { IsBackground = true, Name = "BridgeServerThread" };
        _listenerThread.Start();
        Debug.Log($"[BridgeServer] Listening on port {port}");
    }

    void OnDestroy()
    {
        _running = false;
        _listener?.Stop();
    }

    private void ListenerLoop()
    {
        while (_running)
        {
            HttpListenerContext ctx;
            try { ctx = _listener.GetContext(); }
            catch (Exception) { break; }
            // MJPEG stream blocks its own thread; everything else is handled inline.
            var method = ctx.Request.HttpMethod.ToUpperInvariant();
            var path = ctx.Request.Url.AbsolutePath.TrimEnd('/');
            if (path == "/api/viewport/stream" && method == "GET")
            {
                mjpegStreamer?.HandleStream(ctx);
            }
            else
            {
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    try { Route(ctx); }
                    catch (Exception ex) { Debug.LogError($"[BridgeServer] Route error: {ex.Message}"); }
                });
            }
        }
    }

    private void Route(HttpListenerContext ctx)
    {
        var method = ctx.Request.HttpMethod.ToUpperInvariant();
        var path = ctx.Request.Url.AbsolutePath.TrimEnd('/');

        if (path == "/api/viewport/meta" && method == "GET")
            mjpegStreamer?.HandleMeta(ctx);
        else if (path == "/api/paint" && method == "POST")
            paintExecutor?.HandlePaint(ctx);
        else if (path == "/api/camera" && method == "POST")
            cameraOrbit?.HandleCamera(ctx);
        else if (path == "/api/status" && method == "GET")
            HandleStatus(ctx);
        else
            RespondJson(ctx.Response, 404, "{\"error\":\"not found\"}");
    }

    private void HandleStatus(HttpListenerContext ctx)
    {
        var status = new OperatorStatus
        {
            sim_state = "running",
            perception_source = "viewport",
            rgb_age_seconds = 0f,
        };
        RespondJson(ctx.Response, 200, JsonUtility.ToJson(status));
    }

    public static void RespondJson(HttpListenerResponse res, int code, string body)
    {
        try
        {
            res.StatusCode = code;
            res.ContentType = "application/json";
            var bytes = Encoding.UTF8.GetBytes(body);
            res.ContentLength64 = bytes.Length;
            res.OutputStream.Write(bytes, 0, bytes.Length);
            res.OutputStream.Close();
        }
        catch (Exception) { }
    }
}
