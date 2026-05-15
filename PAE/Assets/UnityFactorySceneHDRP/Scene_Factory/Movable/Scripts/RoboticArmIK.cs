using UnityEngine;
using UnityEngine.InputSystem;

namespace UnityFactorySceneHDRP
{
    /// <summary>
    /// Brazo robótico — Arm5 és l'efector final.
    ///   Arm2 → Y  (pan horitzontal)
    ///   Arm3 → Z  (elevació segment 1)
    ///   Arm4 → Z  (elevació segment 2)
    ///   Arm5 → Z  (orientació efector, controlable externament)
    ///
    /// _arm5AbsoluteAngle defineix l'angle absolut (en graus) de Arm5
    /// respecte el pla XZ. 0° = horitzontal, 90° = apuntant amunt,
    /// -90° = apuntant avall.
    ///
    /// IK Target:  ↑↓←→ (XZ)  +  RightShift / RightCtrl (Y)
    /// Canvi mode: Space
    /// </summary>
    public class RoboticArmIK : MonoBehaviour
    {
        // ── Joints ───────────────────────────────────────────────────────────
        [Header("Joints")]
        [SerializeField] private Transform _arm2;
        [SerializeField] private Transform _arm3;
        [SerializeField] private Transform _arm4;
        [SerializeField] private Transform _arm5;

        // ── IK Target ────────────────────────────────────────────────────────
        [Header("IK Target")]
        [SerializeField] private Transform _ikTarget;

        [Header("Velocitat moviment IK Target (m/s)")]
        [SerializeField] private float _targetMoveSpeed = 1.5f;

        // ── Destí i orientació des d'Inspector ──────────────────────────────
        [Header("Destí + Orientació (ContextMenu → Enviar Destí al Braç)")]
        [SerializeField] private Vector3 _destination;

        [Tooltip("Angle absolut de Arm5 en graus respecte el pla XZ.\n" +
                 " 0° = horitzontal\n 90° = apunta amunt\n-90° = apunta avall")]
        [SerializeField] private float _arm5AbsoluteAngle = 0f;

        // ── Mode ─────────────────────────────────────────────────────────────
        [Header("Mode (Space per canviar)")]
        [SerializeField] private bool _ikMode = false;

        // ── Velocitats ───────────────────────────────────────────────────────
        [Header("Velocitat rotació manual (graus/s)")]
        [SerializeField] private float _rotateSpeed = 80f;

        [Header("Velocitat interpolació IK (graus/s)")]
        [SerializeField] private float _ikSpeed = 150f;

        // ── Límits ───────────────────────────────────────────────────────────
        [Header("Límits joints (graus)")]
        [SerializeField] private Vector2 _arm2Limits = new Vector2(-170f,  170f);
        [SerializeField] private Vector2 _arm3Limits = new Vector2(-150f,  150f);
        [SerializeField] private Vector2 _arm4Limits = new Vector2(-170f,  170f);
        [SerializeField] private Vector2 _arm5Limits = new Vector2(-170f,  170f);

        // ── Angles actuals ───────────────────────────────────────────────────
        private float _a2, _a3, _a4, _a5;

        // ── Angles objectiu IK ───────────────────────────────────────────────
        private float _t2, _t3, _t4;

        // ── Longituds segments ───────────────────────────────────────────────
        private float _L1, _L2, _L3;

        // ────────────────────────────────────────────────────────────────────
        private void Start()
        {
            _L1 = _arm3.localPosition.magnitude;
            _L2 = _arm4.localPosition.magnitude;
            _L3 = _arm5.localPosition.magnitude;

            Debug.Log($"[RoboticArm] Segments  L1={_L1:F3}  L2={_L2:F3}  L3={_L3:F3}");
            Debug.Log($"[RoboticArm] Reach max = {_L1+_L2+_L3:F3}");
        }

        // ────────────────────────────────────────────────────────────────────
        private void Update()
        {
            HandleModeSwitch();
            MoveIKTarget();

            if (_ikMode)
                SolveAndInterpolateIK();
            else
                HandleManualInput();

            ApplyRotations();
        }

        // ── Space: canvia mode ───────────────────────────────────────────────
        private void HandleModeSwitch()
        {
            if (Keyboard.current.spaceKey.wasPressedThisFrame)
            {
                _ikMode = !_ikMode;
                Debug.Log(_ikMode ? "[RoboticArm] ▶ Mode IK" : "[RoboticArm] ▶ Mode Manual");
            }
        }

        // ── Mou IK Target ────────────────────────────────────────────────────
        private void MoveIKTarget()
        {
            if (_ikTarget == null) return;

            var kb   = Keyboard.current;
            float dt = Time.deltaTime;
            Vector3 delta = Vector3.zero;

            if (kb.upArrowKey.isPressed)    delta.z += _targetMoveSpeed * dt;
            if (kb.downArrowKey.isPressed)  delta.z -= _targetMoveSpeed * dt;
            if (kb.rightArrowKey.isPressed) delta.x += _targetMoveSpeed * dt;
            if (kb.leftArrowKey.isPressed)  delta.x -= _targetMoveSpeed * dt;
            if (kb.rightShiftKey.isPressed) delta.y += _targetMoveSpeed * dt;
            if (kb.rightCtrlKey.isPressed)  delta.y -= _targetMoveSpeed * dt;

            _ikTarget.position += delta;
        }

        // ── Botó Inspector ───────────────────────────────────────────────────
        [ContextMenu("Enviar Destí al Braç")]
        public void SendDestination()
        {
            _ikTarget.position = _destination;
            _ikMode = true;
            Debug.Log($"[RoboticArm] Destí enviat: {_destination}  Arm5 angle: {_arm5AbsoluteAngle}°");
        }

        // ── Control manual ───────────────────────────────────────────────────
        private void HandleManualInput()
        {
            var kb = Keyboard.current;
            float dt = Time.deltaTime;

            if (kb.lKey.isPressed)      _a2 += _rotateSpeed * dt;
            else if (kb.jKey.isPressed) _a2 -= _rotateSpeed * dt;
            _a2 = Mathf.Clamp(_a2, _arm2Limits.x, _arm2Limits.y);

            if (kb.uKey.isPressed)      _a3 += _rotateSpeed * dt;
            else if (kb.oKey.isPressed) _a3 -= _rotateSpeed * dt;
            _a3 = Mathf.Clamp(_a3, _arm3Limits.x, _arm3Limits.y);

            if (kb.iKey.isPressed)      _a4 += _rotateSpeed * dt;
            else if (kb.kKey.isPressed) _a4 -= _rotateSpeed * dt;
            _a4 = Mathf.Clamp(_a4, _arm4Limits.x, _arm4Limits.y);

            // Arm5 segueix _arm5AbsoluteAngle fins i tot en manual
            _a5 = Mathf.Clamp(_arm5AbsoluteAngle - (_a3 + _a4), _arm5Limits.x, _arm5Limits.y);
        }

        // ── IK ───────────────────────────────────────────────────────────────
        private void SolveAndInterpolateIK()
        {
            Vector3 basePos   = _arm2.position;
            Vector3 targetPos = _ikTarget.position;

            // ── Convertir target a espacio local de Arm2 ──────────────────────────
            // Así el IK es independiente de la rotación mundial del brazo
            Vector3 localTarget = _arm2.InverseTransformPoint(targetPos);

            // 1. Arm2: pan horizontal en espacio LOCAL
            Vector2 localXZ = new Vector2(localTarget.x, localTarget.z);
            if (localXZ.sqrMagnitude > 1e-4f)
                _t2 = Mathf.Atan2(localXZ.x, localXZ.y) * Mathf.Rad2Deg;
            _t2 = Mathf.Clamp(_t2, _arm2Limits.x, _arm2Limits.y);

            // 2. IK planar — usamos distancia horizontal y vertical en local
            float hDist = localXZ.magnitude;
            float vDist = localTarget.y;

            // Restamos contribución de L3 según ángulo absoluto deseado
            float arm5Rad = _arm5AbsoluteAngle * Mathf.Deg2Rad;
            float hDistAdj = hDist - _L3 * Mathf.Cos(arm5Rad);
            float vDistAdj = vDist - _L3 * Mathf.Sin(arm5Rad);

            float reach = Mathf.Sqrt(hDistAdj * hDistAdj + vDistAdj * vDistAdj);
            float alpha = Mathf.Atan2(vDistAdj, hDistAdj) * Mathf.Rad2Deg;

            reach = Mathf.Clamp(reach, Mathf.Abs(_L1 - _L2) * 1.01f, (_L1 + _L2) * 0.99f);

            float cosAngle3 = Mathf.Clamp(
                (_L1*_L1 + reach*reach - _L2*_L2) / (2f * _L1 * reach), -1f, 1f);
            float angle3 = Mathf.Acos(cosAngle3) * Mathf.Rad2Deg;

            float cosAngle4 = Mathf.Clamp(
                (_L1*_L1 + _L2*_L2 - reach*reach) / (2f * _L1 * _L2), -1f, 1f);
            float angle4 = Mathf.Acos(cosAngle4) * Mathf.Rad2Deg;

            _t3 = Mathf.Clamp(alpha + angle3, _arm3Limits.x, _arm3Limits.y);
            _t4 = Mathf.Clamp(-(180f - angle4), _arm4Limits.x, _arm4Limits.y);

            // 3. Interpolación suave
            float step = _ikSpeed * Time.deltaTime;
            _a2 = Mathf.MoveTowards(_a2, _t2, step);
            _a3 = Mathf.MoveTowards(_a3, _t3, step);
            _a4 = Mathf.MoveTowards(_a4, _t4, step);

            // 4. Arm5: mantiene ángulo absoluto
            _a5 = Mathf.Clamp(_arm5AbsoluteAngle - (_a3 + _a4), _arm5Limits.x, _arm5Limits.y);

            Debug.Log($"localTarget={localTarget}  hDist={hDist:F3}  vDist={vDist:F3}  reach={reach:F3}");
            Debug.Log($"t2={_t2:F1}  t3={_t3:F1}  t4={_t4:F1}");
        }

        // ── Aplica rotacions ─────────────────────────────────────────────────
        private void ApplyRotations()
        {
            _arm2.localRotation = Quaternion.Euler(0f, _a2, 0f);
            _arm3.localRotation = Quaternion.Euler(0f, 0f, _a3);
            _arm4.localRotation = Quaternion.Euler(0f, 0f, _a4);
            _arm5.localRotation = Quaternion.Euler(0f, 0f, _a5);
        }

        // ── API pública ───────────────────────────────────────────────────────
        /// <summary>
        /// Mou el braç a la posició indicada amb l'orientació de l'efector desitjada.
        /// </summary>
        /// <param name="worldPosition">Posició destí en coordenades món.</param>
        /// <param name="arm5AbsoluteAngle">
        /// Angle absolut de Arm5 respecte el pla XZ, en graus.
        ///   0°  = horitzontal (paral·lel al terra)
        ///  90°  = apuntant cap amunt
        /// -90°  = apuntant cap avall
        /// </param>
        public void MoveTo(Vector3 worldPosition, float arm5AbsoluteAngle = 0f)
        {
            _destination       = worldPosition;
            _arm5AbsoluteAngle = arm5AbsoluteAngle;
            SendDestination();
        }
    }
}