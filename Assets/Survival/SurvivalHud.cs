using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;

// Grey HUD drawn without prefabs so the slice runs from an empty scene.
public class SurvivalHud : MonoBehaviour
{
    public Vitals vitals;
    public Inventory inventory;
    public Interactor interactor;
    public PlayerWeapons weapons;
    public PlayerMotor motor;
    public bool inventoryOpen;
    public bool paused;

    GUIStyle title;
    GUIStyle small;
    bool styles;

    void Update()
    {
        var kb = Keyboard.current;
        if (kb == null) return;
        if (vitals != null && vitals.dead)
        {
            motor.menuLock = true;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            Time.timeScale = 1f;
            return;
        }
        if (kb.tabKey.wasPressedThisFrame || kb.iKey.wasPressedThisFrame) inventoryOpen = !inventoryOpen;
        if (kb.escapeKey.wasPressedThisFrame)
        {
            if (inventoryOpen) inventoryOpen = false;
            else paused = !paused;
        }
        bool lockLook = inventoryOpen || paused || (vitals != null && vitals.dead);
        motor.menuLock = lockLook;
        Cursor.lockState = lockLook ? CursorLockMode.None : CursorLockMode.Locked;
        Cursor.visible = lockLook;
        Time.timeScale = lockLook && !vitals.dead ? 0f : 1f;
    }

    void OnGUI()
    {
        if (!styles) MakeStyles();
        if (vitals == null) return;

        var hurt = new Color(0.6f, 0f, 0f, vitals.hurtFlash);
        if (vitals.hurtFlash > 0f)
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, hurt, 0, 0);

        string hint = Weather.Raining
            ? "Дождь глушит шаги и выстрелы."
            : "Найди еду, воду и оружие. Бег и выстрелы слышны.";
        GUI.Label(new Rect(16, 12, 640, 28), hint, small);
        Bar(16, Screen.height - 92, "ЗДОРОВЬЕ", vitals.hp, new Color(0.7f, 0.22f, 0.18f));
        Bar(16, Screen.height - 70, "ВЫНОСЛ.", vitals.stamina, new Color(0.85f, 0.78f, 0.35f));
        Bar(16, Screen.height - 48, "ГОЛОД", vitals.hunger, new Color(0.45f, 0.62f, 0.28f));
        Bar(16, Screen.height - 26, "ЖАЖДА", vitals.thirst, new Color(0.28f, 0.5f, 0.72f));

        if (vitals.bleeding)
            GUI.Label(new Rect(16, Screen.height - 114, 300, 22), "Кровотечение — бинт (H)", title);

        string ammo = weapons != null ? weapons.AmmoLabel() : "";
        GUI.Label(new Rect(Screen.width - 180, Screen.height - 40, 160, 28), ammo, title);
        float kg = inventory != null ? inventory.Weight : 0f;
        GUI.Label(new Rect(Screen.width - 180, Screen.height - 64, 160, 22), kg.ToString("0.0") + " / " + Inventory.MaxWeight.ToString("0") + " кг", small);

        DrawCross();
        if (interactor != null && !string.IsNullOrEmpty(interactor.prompt) && !inventoryOpen)
            GUI.Label(new Rect(Screen.width * 0.5f - 180, Screen.height * 0.62f, 360, 24), interactor.prompt, title);
        if (interactor != null && !string.IsNullOrEmpty(interactor.toast))
            GUI.Label(new Rect(16, 40, 480, 24), interactor.toast, small);

        if (inventoryOpen) DrawInventory();
        if (paused && !vitals.dead) DrawCenter("Пауза", "Esc — продолжить\nМодели: Kenney, Quaternius (CC0)");
        if (vitals.dead) DrawCenter("Ты погиб", vitals.deathReason + "\nR — заново");

        if (vitals.dead && Keyboard.current != null && Keyboard.current.rKey.wasPressedThisFrame)
        {
            Time.timeScale = 1f;
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }
    }

    void DrawInventory()
    {
        var area = new Rect(Screen.width * 0.5f - 280, Screen.height * 0.5f - 200, 560, 400);
        GUI.Box(area, "Рюкзак");
        GUI.Label(new Rect(area.x + 16, area.y + 28, 400, 20), "ЛКМ — использовать, ПКМ — выбросить", small);
        for (int i = 0; i < Inventory.SlotCount; i++)
        {
            int col = i % 4;
            int row = i / 4;
            var r = new Rect(area.x + 16 + col * 132, area.y + 56 + row * 78, 124, 70);
            var s = inventory.slots[i];
            string label = s == null ? "—" : ItemDB.Get(s.id).name + "\n×" + s.qty;
            GUI.Box(r, label);
            if (s != null && Event.current.type == EventType.MouseUp && r.Contains(Event.current.mousePosition))
            {
                if (Event.current.button == 1)
                    inventory.DropSlot(i, motor.transform.position + motor.transform.forward * 1.2f);
                else if (Event.current.button == 0)
                {
                    var def = ItemDB.Get(s.id);
                    if (def.use == ItemDB.UseKind.Fuel)
                        interactor.Say("Подойди к машине и нажми G");
                    else if (def.use != ItemDB.UseKind.None && inventory.Consume(s.id, 1))
                        interactor.Say(vitals.Use(def));
                }
                Event.current.Use();
            }
        }
    }

    void DrawCenter(string head, string body)
    {
        GUI.Box(new Rect(Screen.width * 0.5f - 160, Screen.height * 0.5f - 60, 320, 120), head);
        GUI.Label(new Rect(Screen.width * 0.5f - 140, Screen.height * 0.5f - 20, 280, 60), body, title);
    }

    void DrawCross()
    {
        float x = Screen.width * 0.5f, y = Screen.height * 0.5f;
        GUI.DrawTexture(new Rect(x - 8, y - 1, 16, 2), Texture2D.whiteTexture);
        GUI.DrawTexture(new Rect(x - 1, y - 8, 2, 16), Texture2D.whiteTexture);
    }

    void Bar(float x, float y, string name, float value, Color color)
    {
        GUI.Label(new Rect(x, y, 70, 18), name, small);
        var back = new Rect(x + 74, y + 2, 180, 12);
        GUI.DrawTexture(back, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, new Color(0, 0, 0, 0.55f), 0, 0);
        GUI.DrawTexture(new Rect(back.x, back.y, 180f * Mathf.Clamp01(value / 100f), 12), Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, color, 0, 0);
    }

    void MakeStyles()
    {
        title = new GUIStyle(GUI.skin.label) { fontSize = 16, fontStyle = FontStyle.Bold, normal = { textColor = Color.white } };
        small = new GUIStyle(GUI.skin.label) { fontSize = 13, normal = { textColor = new Color(0.92f, 0.92f, 0.88f) } };
        styles = true;
    }
}
