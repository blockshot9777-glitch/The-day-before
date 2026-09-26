using UnityEngine;

// Hunger, thirst, stamina and bleeding. Empty stomach or dry mouth starts killing.
public class Vitals : MonoBehaviour
{
    public float hp = 100f;
    public float stamina = 100f;
    public float hunger = 100f;
    public float thirst = 100f;
    public bool bleeding;
    public bool dead;
    public string deathReason = "";
    public float hurtFlash;

    public bool Sprinting;

    void Update()
    {
        if (dead) return;
        float dt = Time.deltaTime;
        hunger = Mathf.Max(0f, hunger - dt * 0.16f);
        thirst = Mathf.Max(0f, thirst - dt * 0.24f);
        if (Sprinting && stamina > 0f) stamina = Mathf.Max(0f, stamina - dt * 18f);
        else stamina = Mathf.Min(100f, stamina + dt * (Sprinting ? 0f : 12f));

        if (bleeding) hp -= dt * 2.2f;
        if (hunger <= 0f) hp -= dt * 1.4f;
        if (thirst <= 0f) hp -= dt * 2.4f;
        if (hurtFlash > 0f) hurtFlash -= dt;

        if (hp <= 0f)
        {
            hp = 0f;
            dead = true;
            if (string.IsNullOrEmpty(deathReason))
            {
                if (thirst <= 0f) deathReason = "Жажда";
                else if (hunger <= 0f) deathReason = "Голод";
                else if (bleeding) deathReason = "Кровотечение";
                else deathReason = "Ранения";
            }
        }
    }

    public void Damage(float amount, string reason)
    {
        if (dead) return;
        hp -= amount;
        hurtFlash = 0.45f;
        if (amount >= 8f && Random.value < 0.45f) bleeding = true;
        if (hp <= 0f) deathReason = reason;
    }

    public string Use(ItemDB.Def def)
    {
        switch (def.use)
        {
            case ItemDB.UseKind.Food:
                hunger = Mathf.Min(100f, hunger + def.amount);
                return "Съел: " + def.name;
            case ItemDB.UseKind.Drink:
                thirst = Mathf.Min(100f, thirst + def.amount);
                return "Выпил: " + def.name;
            case ItemDB.UseKind.Bandage:
                bleeding = false;
                hp = Mathf.Min(100f, hp + def.amount);
                return "Перевязал рану";
            case ItemDB.UseKind.Medkit:
                bleeding = false;
                hp = Mathf.Min(100f, hp + def.amount);
                return "Использовал аптечку";
            default:
                return "";
        }
    }
}
