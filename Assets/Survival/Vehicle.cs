using UnityEngine;
using UnityEngine.InputSystem;

// Arcade car: sit down with E, WASD to drive, fuel runs out, the engine calls the infected.
public class Vehicle : MonoBehaviour
{
    public float fuel = 50f;
    public bool occupied;
    Transform rider;
    CharacterController riderBody;
    PlayerMotor motor;
    Transform seat;
    Vector3 savedCamLocal;
    bool drivingCam;
    float speed;

    public string Prompt => occupied ? "E — выйти" : "E — сесть за руль  (" + Mathf.CeilToInt(fuel) + " л)";

    public bool Enter(Transform player)
    {
        if (occupied || fuel <= 0f) return false;
        rider = player;
        riderBody = player.GetComponent<CharacterController>();
        motor = player.GetComponent<PlayerMotor>();
        if (riderBody != null) riderBody.enabled = false;
        if (motor != null) motor.frozen = true;

        EnsureSeat();
        // Seat is counter-scaled so local metres stay metres despite FitHeight on the glTF root.
        player.SetParent(seat, false);
        player.localPosition = new Vector3(0.34f, 0.12f, 0.08f);
        player.localRotation = Quaternion.identity;
        player.localScale = Vector3.one;

        if (motor != null && motor.view != null)
        {
            savedCamLocal = motor.view.localPosition;
            drivingCam = true;
            motor.view.localPosition = new Vector3(0.05f, 1.08f, 0.1f);
            motor.SnapPitch(6f);
        }
        SetViewModel(false);
        occupied = true;
        return true;
    }

    public void Exit()
    {
        if (!occupied || rider == null) return;
        SetViewModel(true);
        if (drivingCam && motor != null && motor.view != null)
            motor.view.localPosition = savedCamLocal.sqrMagnitude > 0.01f ? savedCamLocal : new Vector3(0f, 1.68f, 0f);
        drivingCam = false;
        rider.SetParent(null, true);
        rider.localScale = Vector3.one;
        rider.position = transform.position + transform.right * 2.4f + Vector3.up * 0.15f;
        if (riderBody != null) riderBody.enabled = true;
        if (motor != null) motor.frozen = false;
        occupied = false;
        rider = null;
    }

    void EnsureSeat()
    {
        if (seat != null) return;
        seat = new GameObject("Seat").transform;
        seat.SetParent(transform, false);
        seat.localPosition = Vector3.zero;
        seat.localRotation = Quaternion.identity;
        Vector3 ls = transform.lossyScale;
        float sx = Mathf.Abs(ls.x) < 1e-4f ? 1f : ls.x;
        float sy = Mathf.Abs(ls.y) < 1e-4f ? 1f : ls.y;
        float sz = Mathf.Abs(ls.z) < 1e-4f ? 1f : ls.z;
        seat.localScale = new Vector3(1f / sx, 1f / sy, 1f / sz);
    }

    public static void Dress(GameObject car)
    {
        if (car == null) return;
        foreach (var r in car.GetComponentsInChildren<Renderer>())
        foreach (var m in r.materials)
        {
            string n = m.name.ToLower();
            if (n.Contains("window"))
            {
                var c = new Color(0.65f, 0.8f, 0.85f, 0.22f);
                if (m.HasProperty("baseColorFactor")) m.SetColor("baseColorFactor", c);
                if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
                m.color = c;
                if (m.HasProperty("_Surface"))
                {
                    m.SetFloat("_Surface", 1f);
                    m.SetOverrideTag("RenderType", "Transparent");
                    m.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
                    m.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                    m.SetInt("_ZWrite", 0);
                    m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                    m.renderQueue = 3000;
                }
            }
            else if (n.Contains("head") || n.Contains("tail"))
            {
                m.EnableKeyword("_EMISSION");
                var glow = n.Contains("tail") ? new Color(0.8f, 0.06f, 0.04f) * 1.5f : new Color(1f, 0.95f, 0.8f) * 2f;
                if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", glow);
            }
        }
    }

    void SetViewModel(bool on)
    {
        if (rider == null) return;
        var guns = rider.GetComponent<PlayerWeapons>();
        if (guns != null && guns.viewModel != null) guns.viewModel.gameObject.SetActive(on);
    }

    public void AddFuel(float litres) => fuel = Mathf.Min(80f, fuel + litres);

    void Update()
    {
        if (!occupied) return;
        var kb = Keyboard.current;
        if (kb == null) return;
        float throttle = 0f;
        if (kb.wKey.isPressed) throttle += 1f;
        if (kb.sKey.isPressed) throttle -= 0.55f;
        float turn = 0f;
        if (kb.dKey.isPressed) turn += 1f;
        if (kb.aKey.isPressed) turn -= 1f;
        if (fuel <= 0f) throttle = 0f;
        speed = Mathf.MoveTowards(speed, throttle * 14f, Time.deltaTime * 10f);
        if (Mathf.Abs(speed) > 0.4f)
        {
            fuel = Mathf.Max(0f, fuel - Time.deltaTime * 0.7f);
            transform.Rotate(0f, turn * 70f * Time.deltaTime * Mathf.Sign(Mathf.Abs(speed) < 0.1f ? 1f : speed), 0f);
            PlayerWeapons.LastNoise = transform.position;
            PlayerWeapons.LastNoiseTime = Time.time;
            PlayerWeapons.LastNoiseRange = 42f;
        }
        transform.position += transform.forward * speed * Time.deltaTime;
        var p = transform.position;
        p.y = 0f;
        transform.position = p;
    }
}

// Hinge door. E swings it. Enough hits leave it open and unblocked.
public class Door : MonoBehaviour
{
    public bool open;
    public bool broken;
    public float hp = 30f;
    float angle;
    Collider[] blocks;

    void Awake() => blocks = GetComponentsInChildren<Collider>();

    public string Prompt => broken ? "" : open ? "E — закрыть дверь" : "E — открыть дверь";

    public void Toggle()
    {
        if (!broken) open = !open;
    }

    public void Hit(float dmg)
    {
        if (broken) return;
        hp -= dmg;
        if (hp <= 0f)
        {
            broken = true;
            open = true;
            if (blocks != null)
                foreach (var c in blocks) if (c != null) c.enabled = false;
        }
    }

    void Update()
    {
        float target = open ? 100f : 0f;
        angle = Mathf.MoveTowards(angle, target, 220f * Time.deltaTime);
        transform.localRotation = Quaternion.Euler(0f, angle, 0f);
    }
}
