using System;

[Serializable]
public class PaintCommand
{
    public int paint_job_id;
    public string mask_uri;
    public string part_class;
    public float requested_at;
}

[Serializable]
public class CameraCommand
{
    public float dx;
    public float dy;
    public float zoom;
}

[Serializable]
public class ViewportMeta
{
    public int width;
    public int height;
    public float fov_h;
}

[Serializable]
public class OperatorStatus
{
    public string sim_state;
    public string perception_source;
    public float rgb_age_seconds;
}
