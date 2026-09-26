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
            Hit(2.1f, 22f, false);
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
        if (gun) dir = Quaternion.Euler(Random.Range(-1.2f, 1.2f), Random.Range(-1.2f, 1.2f), 0f) * dir;
        if (!Physics.Raycast(origin, dir, out RaycastHit hit, range, ~0, QueryTriggerInteraction.Ignore)) return;
        var door = hit.collider.GetComponentInParent<Door>();
        if (door != null) door.Hit(damage);
        var z = hit.collider.GetComponentInParent<Zombie>();
        if (z == null) return;
        float dmg = damage;
        if (hit.collider.name == "Head") dmg *= 2.3f;
        z.Hurt(dmg);
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
        if (t != null) t.gameObject.SetActive(true);
    }

    public string AmmoLabel()
    {
        if (slot == 0) return "Нож";
        return mag + " / " + (inventory != null ? inventory.Count("ammo") : 0);
    }
}
