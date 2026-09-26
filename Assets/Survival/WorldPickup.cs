using UnityEngine;

public class WorldPickup : MonoBehaviour
{
    public string id;
    public int qty = 1;

    public static WorldPickup Spawn(string id, int qty, Vector3 pos)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = "Pickup_" + id;
        go.transform.position = pos + Vector3.up * 0.25f;
        go.transform.localScale = new Vector3(0.28f, 0.18f, 0.22f);
        var r = go.GetComponent<Renderer>();
        r.sharedMaterial = GreyboxWorld.Mat(new Color(0.75f, 0.62f, 0.28f), 0.4f);
        var p = go.AddComponent<WorldPickup>();
        p.id = id;
        p.qty = qty;
        return p;
    }

    void Update()
    {
        transform.Rotate(0f, 40f * Time.deltaTime, 0f);
    }
}
