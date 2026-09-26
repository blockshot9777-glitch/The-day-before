using UnityEngine;
using UnityEngine.InputSystem;

// Knife is always there and quiet. The pistol only exists after it is looted.
public class PlayerWeapons : MonoBehaviour
{
    public Camera eyes;
    public Inventory inventory;
    public Vitals vitals;
    public int slot; // 0 knife, 1 pistol
    public int mag = 0;
    public const int MagSize = 8;
    public Transform viewModel;

    float nextShot;
    bool reloading;
    float reloadT;
    float swing;

    public static Vector3 LastNoise;
    public static float LastNoiseTime = -99f;
    public static float LastNoiseRange = 36f;
    public PlayerMotor motor;

    void Update()
    {
        var kb = Keyboard.current;
        var mouse = Mouse.current;
        if (kb == null || mouse == null || vitals != null && vitals.dead) return;
        if (motor != null && (motor.frozen || motor.menuLock))
        {
            if (motor.frozen && viewModel != null) viewModel.gameObject.SetActive(false);
            return;
        }
        if (viewModel != null && !viewModel.gameObject.activeSelf) viewModel.gameObject.SetActive(true);

        bool hasGun = inventory != null && inventory.Count("pistol") > 0;
        if (kb.digit1Key.wasPressedThisFrame) slot = 0;
        if (kb.digit2Key.wasPressedThisFrame && hasGun) slot = 1;
        if (!hasGun) slot = 0;

        if (reloading)
        {
            reloadT -= Time.deltaTime;
            if (reloadT <= 0f) FinishReload();
            return;
        }

        if (slot == 1 && kb.rKey.wasPressedThisFrame) StartReload();
        if (mouse.leftButton.wasPressedThisFrame && Time.time >= nextShot) Fire();
        UpdateView();
    }

    void Fire()
    {
        if (slot == 0)
        {
            nextShot = Time.time + 0.45f;
            swing = 0.16f;
            Hit(2.6f, 34f, false);
            return;
        }
        if (mag <= 0)
        {
            StartReload();
            return;
        }
        mag--;
        nextShot = Time.time + 0.22f;
        LastNoise = transform.position;
        LastNoiseTime = Time.time;
        LastNoiseRange = 40f;
        Hit(40f, 28f, true);
    }

    void Hit(float range, float damage, bool gun)
    {
        Vector3 origin = eyes.transform.position;
        Vector3 dir = eyes.transform.forward;
        if (gun) dir = Quaternion.Euler(Random.Range(-0.5f, 0.5f), Random.Range(-0.5f, 0.5f), 0f) * dir;
        // The camera sits inside the body capsule, so a raw ray always hits the player first.
        float radius = gun ? 0.03f : 0.4f;
        var hits = Physics.SphereCastAll(origin, radius, dir, range, ~0, QueryTriggerInteraction.Ignore);
        if (!TryPick(hits, out var best)) return;
        var door = best.collider.GetComponentInParent<Door>();
        if (door != null) door.Hit(damage);
        var z = best.collider.GetComponentInParent<Zombie>();
        if (z == null) return;
        z.Hurt(damage * DamageScale(best.collider.name));
    }

    // The camera sits inside the body, so the player's own capsule is usually the first hit.
    public static bool TryPick(RaycastHit[] hits, out RaycastHit best)
    {
        bool any = false;
        best = default;
        float bestD = float.MaxValue;
        if (hits == null) return false;
        foreach (var hit in hits)
        {
            if (hit.collider == null) continue;
            if (hit.collider.GetComponentInParent<PlayerMotor>() != null) continue;
            if (hit.distance >= bestD) continue;
            bestD = hit.distance;
            best = hit;
            any = true;
        }
        return any;
    }

    public static float DamageScale(string colliderName)
    {
        return colliderName == "Head" ? 2.3f : 1f;
    }

    void StartReload()
    {
        if (slot != 1 || inventory == null || inventory.Count("ammo") <= 0 || mag >= MagSize) return;
        reloading = true;
        reloadT = 1.35f;
    }

    void FinishReload()
    {
        reloading = false;
        int need = MagSize - mag;
        int have = inventory.Count("ammo");
        int take = Mathf.Min(need, have);
        if (take > 0 && inventory.Consume("ammo", take)) mag += take;
    }

    void UpdateView()
    {
        if (viewModel == null) return;
        foreach (Transform c in viewModel) c.gameObject.SetActive(false);
        string show = slot == 1 ? "Pistol" : "Knife";
        var t = viewModel.Find(show);
        if (t == null) return;
        t.gameObject.SetActive(true);
        if (show != "Knife") return;
        if (swing > 0f) swing -= Time.deltaTime;
        float u = swing > 0f ? 1f - swing / 0.16f : 1f;
        var rest = Quaternion.Euler(90f, -8f, -18f);
        var strike = Quaternion.Euler(48f, -24f, -62f);
        t.localRotation = Quaternion.Slerp(rest, strike, swing > 0f ? Mathf.Sin(u * Mathf.PI) : 0f);
    }

    public string AmmoLabel()
    {
        if (slot == 0) return "Нож";
        return mag + " / " + (inventory != null ? inventory.Count("ammo") : 0);
    }
}
