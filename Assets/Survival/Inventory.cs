using System;
using System.Collections.Generic;
using UnityEngine;

[System.Serializable]
public class ItemStack
{
    public string id;
    public int qty;
}

// Fixed slots plus a weight cap. Adding past the cap fails so the player has to drop something.
public class Inventory : MonoBehaviour
{
    public const int SlotCount = 16;
    public const float MaxWeight = 28f;
    public readonly ItemStack[] slots = new ItemStack[SlotCount];
    public event Action Changed;

    public float Weight
    {
        get
        {
            float w = 0f;
            foreach (var s in slots)
                if (s != null) w += ItemDB.Get(s.id).weight * s.qty;
            return w;
        }
    }

    public int Count(string id)
    {
        int n = 0;
        foreach (var s in slots)
            if (s != null && s.id == id) n += s.qty;
        return n;
    }

    public bool CanAdd(string id, int qty)
    {
        return Weight + ItemDB.Get(id).weight * qty <= MaxWeight + 0.001f && FreeRoom(id, qty);
    }

    bool FreeRoom(string id, int qty)
    {
        int left = qty;
        int stack = ItemDB.Get(id).maxStack;
        foreach (var s in slots)
        {
            if (s == null) left -= stack;
            else if (s.id == id) left -= stack - s.qty;
            if (left <= 0) return true;
        }
        return false;
    }

    public bool Add(string id, int qty)
    {
        if (qty <= 0 || !CanAdd(id, qty)) return false;
        int stack = ItemDB.Get(id).maxStack;
        for (int i = 0; i < slots.Length && qty > 0; i++)
        {
            if (slots[i] != null && slots[i].id == id && slots[i].qty < stack)
            {
                int take = Mathf.Min(stack - slots[i].qty, qty);
                slots[i].qty += take;
                qty -= take;
            }
        }
        for (int i = 0; i < slots.Length && qty > 0; i++)
        {
            if (slots[i] == null)
            {
                int take = Mathf.Min(stack, qty);
                slots[i] = new ItemStack { id = id, qty = take };
                qty -= take;
            }
        }
        Changed?.Invoke();
        return true;
    }

    public bool Consume(string id, int qty)
    {
        if (Count(id) < qty) return false;
        for (int i = slots.Length - 1; i >= 0 && qty > 0; i--)
        {
            if (slots[i] == null || slots[i].id != id) continue;
            int take = Mathf.Min(slots[i].qty, qty);
            slots[i].qty -= take;
            qty -= take;
            if (slots[i].qty <= 0) slots[i] = null;
        }
        Changed?.Invoke();
        return true;
    }

    public void DropSlot(int index, Vector3 pos)
    {
        var s = slots[index];
        if (s == null) return;
        slots[index] = null;
        Changed?.Invoke();
        WorldPickup.Spawn(s.id, s.qty, pos);
    }
}
