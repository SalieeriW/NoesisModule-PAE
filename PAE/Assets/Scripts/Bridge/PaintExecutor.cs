using System;
using System.IO;
using System.Net;
using UnityEngine;

/// <summary>
/// Handles POST /api/paint from sim-service.
///
/// Implement IPaintHandler on any MonoBehaviour and assign it to paintHandler
/// to receive paint commands in the Unity scene (e.g. trigger a particle system,
/// apply a decal, or drive a robot arm).
///
/// Setup:
///   1. Attach to the BridgeServer GameObject (or any active GameObject).
///   2. Assign paintHandler to the script that handles your spray VFX.
///   3. Assign this component to BridgeServer.paintExecutor.
/// </summary>
public class PaintExecutor : MonoBehaviour
{
    [Tooltip("MonoBehaviour that implements IPaintHandler. Receives OnPaintCommand each time a paint job is dispatched.")]
    public MonoBehaviour paintHandler;

    public void HandlePaint(HttpListenerContext ctx)
    {
        string body;
        using (var reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            body = reader.ReadToEnd();

        PaintCommand cmd;
        try { cmd = JsonUtility.FromJson<PaintCommand>(body); }
        catch (Exception ex)
        {
            Debug.LogWarning($"[PaintExecutor] Failed to parse paint command: {ex.Message}");
            BridgeServer.RespondJson(ctx.Response, 400, "{\"error\":\"invalid json\"}");
            return;
        }

        UnityMainThread.Run(() =>
        {
            if (paintHandler is IPaintHandler handler)
                handler.OnPaintCommand(cmd);
            else
                Debug.Log($"[PaintExecutor] Paint job {cmd.paint_job_id} received (no handler assigned). Part: {cmd.part_class}");
        });

        BridgeServer.RespondJson(ctx.Response, 200, "{\"status\":\"accepted\"}");
    }
}

/// <summary>Implement this on any MonoBehaviour to receive paint commands.</summary>
public interface IPaintHandler
{
    void OnPaintCommand(PaintCommand cmd);
}
