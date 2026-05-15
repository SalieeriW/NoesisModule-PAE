using System;
using System.Net;
using System.Text;
using System.Threading;
using UnityEngine;

/// <summary>
/// Captures a Unity Camera as JPEG frames and streams them as MJPEG.
///
/// Endpoints served (via BridgeServer routing):
///   GET /api/viewport/stream  — MJPEG multipart/x-mixed-replace stream
///   GET /api/viewport/meta    — JSON with width, height, fov_h
///
/// Setup:
///   1. Attach to the viewport Camera GameObject.
///   2. Assign this component to BridgeServer.mjpegStreamer.
/// </summary>
[RequireComponent(typeof(Camera))]
public class MjpegStreamer : MonoBehaviour
{
    [Range(1, 100)]
    public int jpegQuality = 80;
    public int captureWidth = 640;
    public int captureHeight = 480;

    private Camera _cam;
    private RenderTexture _rt;
    private Texture2D _tex;

    // Shared between main thread (writer) and stream threads (readers).
    private byte[] _latestFrame;
    private readonly object _frameLock = new object();

    void Start()
    {
        _cam = GetComponent<Camera>();
        _rt = new RenderTexture(captureWidth, captureHeight, 24, RenderTextureFormat.ARGB32);
        _tex = new Texture2D(captureWidth, captureHeight, TextureFormat.RGB24, false);
    }

    void LateUpdate()
    {
        var prev = _cam.targetTexture;
        _cam.targetTexture = _rt;
        _cam.Render();
        _cam.targetTexture = prev;

        var prevActive = RenderTexture.active;
        RenderTexture.active = _rt;
        _tex.ReadPixels(new Rect(0, 0, captureWidth, captureHeight), 0, 0, false);
        _tex.Apply(false);
        RenderTexture.active = prevActive;

        var jpeg = ImageConversion.EncodeToJPG(_tex, jpegQuality);
        lock (_frameLock)
            _latestFrame = jpeg;
    }

    public void HandleMeta(HttpListenerContext ctx)
    {
        float fovH = _cam != null
            ? Camera.VerticalToHorizontalFieldOfView(_cam.fieldOfView, (float)captureWidth / captureHeight)
            : 60f;
        var meta = new ViewportMeta { width = captureWidth, height = captureHeight, fov_h = fovH };
        BridgeServer.RespondJson(ctx.Response, 200, JsonUtility.ToJson(meta));
    }

    public void HandleStream(HttpListenerContext ctx)
    {
        // Each client gets its own background streaming thread.
        var t = new Thread(() => StreamLoop(ctx)) { IsBackground = true, Name = "MjpegStreamThread" };
        t.Start();
    }

    private void StreamLoop(HttpListenerContext ctx)
    {
        const string boundary = "frame";
        ctx.Response.ContentType = $"multipart/x-mixed-replace; boundary={boundary}";
        ctx.Response.StatusCode = 200;
        ctx.Response.SendChunked = true;

        var stream = ctx.Response.OutputStream;
        try
        {
            while (true)
            {
                byte[] frame;
                lock (_frameLock)
                    frame = _latestFrame;

                if (frame == null)
                {
                    Thread.Sleep(50);
                    continue;
                }

                var header = Encoding.ASCII.GetBytes(
                    $"--{boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: {frame.Length}\r\n\r\n");
                stream.Write(header, 0, header.Length);
                stream.Write(frame, 0, frame.Length);
                stream.Write(new byte[] { 0x0d, 0x0a }, 0, 2);
                stream.Flush();
                Thread.Sleep(33); // ~30 fps
            }
        }
        catch (Exception) { /* client disconnected */ }
        finally
        {
            try { stream.Close(); } catch (Exception) { }
        }
    }

    void OnDestroy()
    {
        if (_rt != null) _rt.Release();
    }
}
