using UnityEngine;
using System.Collections.Generic;
using System.IO;
using System;
using System.Text;

// OnRenderImage no funciona en HDRP. Todo el acceso a profundidad se hace via Physics.Raycast.
[RequireComponent(typeof(Camera))]
public class depth_script : MonoBehaviour
{
    private Texture2D fullDepthCache;
    private Camera cam;

    void Start()
    {
        cam = GetComponent<Camera>();
    }

    // Captura el mapa de profundidad via raycast a la resolución indicada.
    // Llamar antes de GuardarMapaProfundidad(). 256 da buen equilibrio velocidad/detalle.
    public void CaptureFullDepthMap(int resolucion = 256)
    {
        if (fullDepthCache == null || fullDepthCache.width != resolucion)
        {
            if (fullDepthCache != null) Destroy(fullDepthCache);
            fullDepthCache = new Texture2D(resolucion, resolucion, TextureFormat.RFloat, false);
        }

        Color[] pixels = new Color[resolucion * resolucion];
        for (int y = 0; y < resolucion; y++)
        {
            for (int x = 0; x < resolucion; x++)
            {
                float u = (x + 0.5f) / resolucion;
                float v = (y + 0.5f) / resolucion;
                Ray ray = cam.ViewportPointToRay(new Vector3(u, v, 0f));
                float normalizedDepth = 1f;
                if (Physics.Raycast(ray, out RaycastHit hit, cam.farClipPlane))
                    normalizedDepth = hit.distance / cam.farClipPlane;
                pixels[y * resolucion + x] = new Color(normalizedDepth, 0f, 0f, 1f);
            }
        }
        fullDepthCache.SetPixels(pixels);
        fullDepthCache.Apply();
    }

    // Transforma un píxel de la IA en una coordenada del mundo real via raycast.
    public Vector3 MapAIPixelTo3DWorld(float pixelX, float pixelY, float imageWidth, float imageHeight)
    {
        float u = pixelX / imageWidth;
        float v = 1f - pixelY / imageHeight;
        Ray ray = cam.ViewportPointToRay(new Vector3(u, v, 0f));
        if (Physics.Raycast(ray, out RaycastHit hit, cam.farClipPlane))
            return hit.point;
        return cam.ViewportToWorldPoint(new Vector3(u, v, cam.farClipPlane));
    }

    // Guarda el mapa de profundidad capturado como PNG visual y EXR float32.
    public void GuardarMapaProfundidad(string rutaBase)
    {
        if (fullDepthCache == null)
        {
            Debug.LogError("Llama a CaptureFullDepthMap() antes de GuardarMapaProfundidad().");
            return;
        }

        int res = fullDepthCache.width;
        Texture2D depthVisual = new Texture2D(res, res, TextureFormat.RGB24, false);
        Color[] rawPixels = fullDepthCache.GetPixels();
        Color[] grayPixels = new Color[rawPixels.Length];
        for (int i = 0; i < rawPixels.Length; i++)
        {
            float d = rawPixels[i].r;
            grayPixels[i] = new Color(d, d, d);
        }
        depthVisual.SetPixels(grayPixels);
        depthVisual.Apply();
        File.WriteAllBytes(rutaBase + "_depth.png", depthVisual.EncodeToPNG());
        Destroy(depthVisual);

        File.WriteAllBytes(rutaBase + "_depth.exr",
            fullDepthCache.EncodeToEXR(Texture2D.EXRFlags.OutputAsFloat));

        Debug.Log($"Profundidad guardada en:\n  {rutaBase}_depth.png (visual)\n  {rutaBase}_depth.exr (float32)");
    }

    // Guarda JSON y CSV con una cuadrícula de valores en metros via raycast (128x128).
    public void GuardarDocumentoProfundidad(string rutaBase, int resolucion = 128)
    {
        float[,] grid = new float[resolucion, resolucion];
        float minDepth = float.MaxValue, maxDepth = float.MinValue, sumDepth = 0f;

        for (int row = 0; row < resolucion; row++)
        {
            for (int col = 0; col < resolucion; col++)
            {
                float u = (col + 0.5f) / resolucion;
                float v = (row + 0.5f) / resolucion;
                Ray ray = cam.ViewportPointToRay(new Vector3(u, v, 0f));
                float depthMeters = cam.farClipPlane;
                if (Physics.Raycast(ray, out RaycastHit hit, cam.farClipPlane))
                    depthMeters = hit.distance;
                grid[row, col] = depthMeters;
                if (depthMeters < minDepth) minDepth = depthMeters;
                if (depthMeters > maxDepth) maxDepth = depthMeters;
                sumDepth += depthMeters;
            }
        }
        float meanDepth = sumDepth / (resolucion * resolucion);

        GuardarJSON(rutaBase, grid, resolucion, minDepth, maxDepth, meanDepth);
        GuardarCSV(rutaBase, grid, resolucion, minDepth, maxDepth, meanDepth);

        Debug.Log($"Documentos de profundidad guardados:\n  {rutaBase}_depth.json\n  {rutaBase}_depth.csv");
    }

    private void GuardarJSON(string rutaBase, float[,] grid, int res, float minD, float maxD, float meanD)
    {
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("{");
        sb.AppendLine($"  \"timestamp\": \"{DateTime.Now:yyyy-MM-dd HH:mm:ss}\",");
        sb.AppendLine("  \"camara\": {");
        sb.AppendLine($"    \"posicion\": {{ \"x\": {cam.transform.position.x:F4}, \"y\": {cam.transform.position.y:F4}, \"z\": {cam.transform.position.z:F4} }},");
        sb.AppendLine($"    \"rotacion\": {{ \"x\": {cam.transform.eulerAngles.x:F4}, \"y\": {cam.transform.eulerAngles.y:F4}, \"z\": {cam.transform.eulerAngles.z:F4} }},");
        sb.AppendLine($"    \"fov\": {cam.fieldOfView:F4},");
        sb.AppendLine($"    \"nearClip_m\": {cam.nearClipPlane:F4},");
        sb.AppendLine($"    \"farClip_m\": {cam.farClipPlane:F4}");
        sb.AppendLine("  },");
        sb.AppendLine("  \"estadisticas\": {");
        sb.AppendLine($"    \"min_m\": {minD:F4},");
        sb.AppendLine($"    \"max_m\": {maxD:F4},");
        sb.AppendLine($"    \"media_m\": {meanD:F4}");
        sb.AppendLine("  },");
        sb.AppendLine($"  \"resolucion\": {res},");
        sb.AppendLine("  \"profundidad_m\": [");
        for (int row = 0; row < res; row++)
        {
            sb.Append("    [");
            for (int col = 0; col < res; col++)
            {
                sb.Append($"{grid[row, col]:F4}");
                if (col < res - 1) sb.Append(", ");
            }
            sb.Append("]");
            sb.AppendLine(row < res - 1 ? "," : "");
        }
        sb.AppendLine("  ]");
        sb.Append("}");
        File.WriteAllText(rutaBase + "_depth.json", sb.ToString());
    }

    private void GuardarCSV(string rutaBase, float[,] grid, int res, float minD, float maxD, float meanD)
    {
        StringBuilder sb = new StringBuilder();
        sb.AppendLine($"# Timestamp: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"# Camara posicion: {cam.transform.position.x:F4},{cam.transform.position.y:F4},{cam.transform.position.z:F4}");
        sb.AppendLine($"# FOV: {cam.fieldOfView:F4} | Near: {cam.nearClipPlane:F4}m | Far: {cam.farClipPlane:F4}m");
        sb.AppendLine($"# Profundidad min: {minD:F4}m | max: {maxD:F4}m | media: {meanD:F4}m");
        sb.AppendLine($"# Cuadricula {res}x{res} — valores en metros");
        for (int row = 0; row < res; row++)
        {
            for (int col = 0; col < res; col++)
            {
                sb.Append($"{grid[row, col]:F4}");
                if (col < res - 1) sb.Append(",");
            }
            sb.AppendLine();
        }
        File.WriteAllText(rutaBase + "_depth.csv", sb.ToString());
    }

    private void OnDestroy()
    {
        if (fullDepthCache != null) Destroy(fullDepthCache);
    }
}
