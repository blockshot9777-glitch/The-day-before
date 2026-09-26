using System.Collections.Generic;

// Item definitions for the greybox survival loop. Names shown to the player are Russian.
public class ItemDB
{
    public enum UseKind { None, Food, Drink, Bandage, Medkit, Fuel }

    public class Def
    {
        public string id;
        public string name;
        public float weight;
        public int maxStack;
        public UseKind use;
        public float amount;
    }

    public static readonly Dictionary<string, Def> All = new Dictionary<string, Def>
    {
        ["water"] = new Def { id = "water", name = "Вода", weight = 0.5f, maxStack = 4, use = UseKind.Drink, amount = 40f },
        ["can"] = new Def { id = "can", name = "Тушёнка", weight = 0.4f, maxStack = 4, use = UseKind.Food, amount = 35f },
        ["bread"] = new Def { id = "bread", name = "Хлеб", weight = 0.3f, maxStack = 4, use = UseKind.Food, amount = 22f },
        ["bandage"] = new Def { id = "bandage", name = "Бинт", weight = 0.1f, maxStack = 6, use = UseKind.Bandage, amount = 15f },
        ["medkit"] = new Def { id = "medkit", name = "Аптечка", weight = 0.7f, maxStack = 2, use = UseKind.Medkit, amount = 55f },
        ["ammo"] = new Def { id = "ammo", name = "Патроны 9 мм", weight = 0.02f, maxStack = 40, use = UseKind.None },
        ["pistol"] = new Def { id = "pistol", name = "ПМ", weight = 0.8f, maxStack = 1, use = UseKind.None },
        ["gas"] = new Def { id = "gas", name = "Канистра", weight = 4.5f, maxStack = 1, use = UseKind.Fuel, amount = 30f },
    };

    public static Def Get(string id) => All[id];
}
