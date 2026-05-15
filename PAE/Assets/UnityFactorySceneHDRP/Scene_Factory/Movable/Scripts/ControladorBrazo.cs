using UnityEngine;
using System.Collections.Generic;
using System.IO; 
using UnityEngine.InputSystem; // <-- 1. Añadimos esta línea arriba del todo

public class ControladorBrazo : MonoBehaviour
{
    [Header("Conexión con la Cámara")]
    public depth_script camaraDelBrazo; 

    [Header("Datos de la Foto que lee la IA")]
    public float anchoFotoIA = 1024f;
    public float altoFotoIA = 1024f;

    void Update()
    {
        // 2. Usamos el nuevo sistema para detectar si se ha pulsado la tecla C
        if (Keyboard.current != null && Keyboard.current.cKey.wasPressedThisFrame)
        {
            TomarFotoYGuardar();
        }
    }

    public void TomarFotoYGuardar()
    {
        camaraDelBrazo.CaptureFullDepthMap();

        Camera camaraFisica = camaraDelBrazo.GetComponent<Camera>();
        RenderTexture rtVisual = camaraFisica.targetTexture;

        if (rtVisual == null)
        {
            Debug.LogError("La cámara del brazo no tiene una Target Texture asignada.");
            return;
        }

        Texture2D foto = new Texture2D(rtVisual.width, rtVisual.height, TextureFormat.RGB24, false);

        RenderTexture.active = rtVisual;
        foto.ReadPixels(new Rect(0, 0, rtVisual.width, rtVisual.height), 0, 0);
        foto.Apply(); 
        RenderTexture.active = null; 

        byte[] bytesDeLaFoto = foto.EncodeToPNG();
        string rutaBase = Application.dataPath + "/FotoIA_Coche";
        File.WriteAllBytes(rutaBase + ".png", bytesDeLaFoto);

        Debug.Log($"¡Foto tomada y guardada con éxito en: {rutaBase}.png!");

        camaraDelBrazo.GuardarMapaProfundidad(rutaBase);
        camaraDelBrazo.GuardarDocumentoProfundidad(rutaBase, 128);

        Destroy(foto);
    }

    public void ProcesarRespuestaIA(List<Vector2> puntosDeLaIA)
    {
        foreach (Vector2 pixel in puntosDeLaIA)
        {
            Vector3 puntoObjetivo3D = camaraDelBrazo.MapAIPixelTo3DWorld(pixel.x, pixel.y, anchoFotoIA, altoFotoIA);
            
            GameObject marcador = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            marcador.transform.position = puntoObjetivo3D;
            marcador.transform.localScale = new Vector3(0.05f, 0.05f, 0.05f);
            marcador.GetComponent<Renderer>().material.color = Color.red;

            Debug.Log($"Moviendo a: {puntoObjetivo3D}");
        }
    }
}