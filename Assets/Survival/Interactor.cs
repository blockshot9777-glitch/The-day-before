using UnityEngine;
using UnityEngine.InputSystem;

public class LootContainer : MonoBehaviour
{
    public string label = "Ящик";
    public ItemStack[] items = System.Array.Empty<ItemStack>();
    public bool empty;
}

// Looks forward and uses E on containers and pickups. Searching takes a short hold.
public class Interactor : MonoBehaviour
{
    public Camera eyes;
    public Inventory inventory;
    public Vitals vitals;
    public float holdNeeded = 1.05f;
    public float hold;
    public string prompt = "";
    public string toast = "";
    float toastT;

    LootContainer current;

    void Update()
    {
        if (toastT > 0f) toastT -= Time.deltaTime;
        else toast = "";
        prompt = "";
        current = null;
        var kb = Keyboard.current;
        if (eyes == null || vitals != null && vitals.dead) return;

        var riding = GetComponentInParent<Vehicle>();
        if (riding != null && riding.occupied)
        {
            prompt = riding.Prompt;
            if (kb != null && kb.eKey.wasPressedThisFrame) riding.Exit();
            if (kb != null && kb.gKey.wasPressedThisFrame) Pour(riding);
            return;
        }

        if (!TryAim(out var pickup, out var door, out var car, out var box))
        {
            hold = 0f;
            if (kb != null && kb.hKey.wasPressedThisFrame) QuickHeal();
            return;
        }

        if (pickup != null)
        {
            var def = ItemDB.Get(pickup.id);
            prompt = "E — подобрать " + def.name + " ×" + pickup.qty;
            if (kb != null && kb.eKey.wasPressedThisFrame) Take(pickup);
        }
        else if (door != null && !door.broken)
        {
            prompt = door.Prompt;
            if (kb != null && kb.eKey.wasPressedThisFrame) door.Toggle();
        }
        else if (car != null)
        {
            prompt = car.Prompt;
            if (inventory != null && inventory.Count("gas") > 0) prompt += "    G — залить канистру";
            if (kb != null && kb.eKey.wasPressedThisFrame)
            {
                if (!car.Enter(transform)) Say("Бак пуст");
            }
            if (kb != null && kb.gKey.wasPressedThisFrame) Pour(car);
        }
        else if (box != null && !box.empty)
        {
            current = box;
            prompt = "Удерживайте E — " + box.label;
            if (kb != null && kb.eKey.isPressed)
            {
                hold += Time.deltaTime;
                if (hold >= holdNeeded) Open(box);
            }
            else hold = 0f;
        }
        else hold = 0f;

        if (kb != null && kb.hKey.wasPressedThisFrame) QuickHeal();
    }

    // Prefer a direct ray; fall back to a tight cone toward the visual center (not a wide sphere grab).
    bool TryAim(out WorldPickup pickup, out Door door, out Vehicle car, out LootContainer box)
    {
        pickup = null;
        door = null;
        car = null;
        box = null;
        Vector3 origin = eyes.transform.position;
        Vector3 dir = eyes.transform.forward;
        if (Physics.Raycast(origin, dir, out RaycastHit hit, 2.8f, ~0, QueryTriggerInteraction.Collide))
        {
            pickup = hit.collider.GetComponent<WorldPickup>();
            door = hit.collider.GetComponentInParent<Door>();
            car = hit.collider.GetComponentInParent<Vehicle>();
            box = hit.collider.GetComponentInParent<LootContainer>();
            if (pickup != null || door != null || car != null || box != null) return true;
        }

        float best = 0.965f;
        bool found = false;
        foreach (var col in Physics.OverlapSphere(origin + dir * 1.5f, 0.85f, ~0, QueryTriggerInteraction.Collide))
        {
            var p = col.GetComponent<WorldPickup>();
            var d = col.GetComponentInParent<Door>();
            var v = col.GetComponentInParent<Vehicle>();
            var l = col.GetComponentInParent<LootContainer>();
            if (p == null && d == null && v == null && l == null) continue;
            GameObject host = p != null ? p.gameObject : d != null ? d.gameObject : v != null ? v.gameObject : l.gameObject;
            Vector3 center = RendererCenter(host);
            Vector3 to = center - origin;
            float dist = to.magnitude;
            if (dist < 0.25f || dist > 2.8f) continue;
            float align = Vector3.Dot(dir, to.normalized);
            if (align < best) continue;
            best = align;
            pickup = p;
            door = d;
            car = v;
            box = l;
            found = true;
        }
        return found;
    }

    public static Vector3 AimPoint(GameObject go) => RendererCenter(go);

    static Vector3 RendererCenter(GameObject go)
    {
        var rs = go.GetComponentsInChildren<Renderer>();
        if (rs.Length == 0) return go.transform.position;
        var b = rs[0].bounds;
        for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
        return b.center;
    }

    void Pour(Vehicle car)
    {
        if (inventory == null || inventory.Count("gas") <= 0) { Say("Нет канистры"); return; }
        if (!inventory.Consume("gas", 1)) return;
        float add = ItemDB.Get("gas").amount;
        car.AddFuel(add);
        Say("Залил " + add.ToString("0") + " л");
    }

    void Take(WorldPickup pickup)
    {
        if (!inventory.Add(pickup.id, pickup.qty))
        {
            Say("Слишком тяжело");
            return;
        }
        Say("Подобрал: " + ItemDB.Get(pickup.id).name);
        Destroy(pickup.gameObject);
    }

    void Open(LootContainer box)
    {
        hold = 0f;
        int got = 0;
        foreach (var s in box.items)
        {
            if (s == null) continue;
            if (inventory.Add(s.id, s.qty)) got++;
            else WorldPickup.Spawn(s.id, s.qty, box.transform.position + box.transform.forward * 0.8f);
        }
        box.items = System.Array.Empty<ItemStack>();
        box.empty = true;
        Say(got > 0 ? "Обыскал: " + box.label : "Пусто");
    }

    void QuickHeal()
    {
        if (vitals.bleeding && inventory.Count("bandage") > 0 && inventory.Consume("bandage", 1))
            Say(vitals.Use(ItemDB.Get("bandage")));
        else if (vitals.hp < 50f && inventory.Count("medkit") > 0 && inventory.Consume("medkit", 1))
            Say(vitals.Use(ItemDB.Get("medkit")));
        else Say("Нечем лечиться");
    }

    public void Say(string msg)
    {
        toast = msg;
        toastT = 2.4f;
    }
}
