using System.Collections.Generic;
using UnityEngine;

// COMPILED_MARKER
// Village dressed with CC0 models: trees, props, a car, and houses you can walk into.
public class GreyboxWorld : MonoBehaviour
{
    public static Material Mat(Color c, float smooth = 0.25f)
    {
        var shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null) shader = Shader.Find("Standard");
        var m = new Material(shader);
        m.color = c;
        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smooth);
        if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
        return m;
    }

    static readonly Dictionary<Color, Material> cache = new Dictionary<Color, Material>();
    static Material C(Color c)
    {
        if (!cache.TryGetValue(c, out var m)) { m = Mat(c); cache[c] = m; }
        return m;
    }

    static readonly string[] Zombies = {
        "Models/zombies/casual-man", "Models/zombies/hoodie-man", "Models/zombies/casual-woman", "Models/zombies/beach-man"
    };

    public Transform player;
    System.Random rng;

    public void Build(Transform playerBody)
    {
        player = playerBody;
        rng = new System.Random(42);
        var sun = VillageLook.Atmosphere();
        sun.gameObject.AddComponent<DayClock>().sun = sun;

        BuildWalkSurface();

        var spots = new[]
        {
            new Vector3(-14f, 0f, -4f), new Vector3(15f, 0f, 8f),
            new Vector3(-16f, 0f, 26f), new Vector3(15.5f, 0f, 40f),
            new Vector3(-15f, 0f, 58f), new Vector3(16f, 0f, 74f),
        };
        for (int i = 0; i < spots.Length; i++)
        {
            float yaw = spots[i].x < 0f ? -90f : 90f;
            var loot = i == 0 ? Stacks(("water", 1), ("can", 1), ("bandage", 2)) : RandomHomeLoot();
            VillageLook.Cottage(spots[i], yaw, i % 4, true, loot, rng);
        }

        VillageLook.Shop(new Vector3(0f, 0f, 102f), Stacks(("pistol", 1), ("ammo", 30), ("water", 2), ("can", 2), ("medkit", 1), ("gas", 1)));
        var far = new[]
        {
            new Vector3(-36f, 0f, 6f), new Vector3(38f, 0f, 22f),
            new Vector3(-40f, 0f, 48f), new Vector3(36f, 0f, 66f),
        };
        for (int i = 0; i < far.Length; i++)
            VillageLook.Cottage(far[i], far[i].x < 0f ? -90f : 90f, (i + 1) % 4, false, RandomHomeLoot(), rng);

        Forest();
        DressYards(spots);
        DressRoad();
        DressStreet();
        PlaceCar(new Vector3(2.6f, 0f, -10f), 6f, true);
        PlaceCar(new Vector3(-2.8f, 0f, 46f), 172f, false);

        for (int i = 0; i < 4; i++)
        {
            Vector3 p = spots[i + 1] + new Vector3(i % 2 == 0 ? 11f : -11f, 0f, 7f);
            SpawnZombie(p);
        }
    }

    void Forest()
    {
        // Three scans of the same mesh. A forest of them is millions of triangles.
        Prop("tree_small_02", new Vector3(-28f, 0f, -12f), 25f, 4.65f, false);
        Prop("tree_small_02", new Vector3(28f, 0f, 24f), 150f, 4.65f, false);
        Prop("tree_small_02", new Vector3(-30f, 0f, 58f), 40f, 4.65f, false);
        Prop("dead_tree_trunk", new Vector3(-22f, 0f, 12f), 70f, 0.32f, true);
        Prop("dead_tree_trunk_02", new Vector3(22f, 0f, 34f), 20f, 1.05f, true);
        Prop("dead_tree_trunk", new Vector3(-24f, 0f, 78f), 110f, 0.32f, true);
        Prop("boulder_01", new Vector3(-17f, 0f, 16f), 30f, 1.0f, true);
        Prop("boulder_01", new Vector3(18.5f, 0f, 60f), 80f, 1.15f, true);
        Prop("searsia_lucida", new Vector3(17f, 0f, -4f), 15f, 2.34f, false);
        Prop("searsia_lucida", new Vector3(-16.5f, 0f, 38f), 70f, 2.34f, false);
        string sap = Resources.Load<GameObject>("Poly/pine_sapling_small/pine_sapling_small_1k") != null ? "pine_sapling_small" : null;
        if (sap != null)
        {
            Prop(sap, new Vector3(-26f, 0f, 4f), 10f, 1.3f, false);
            Prop(sap, new Vector3(25f, 0f, 48f), 40f, 1.3f, false);
            Prop(sap, new Vector3(-23f, 0f, 90f), 80f, 1.3f, false);
        }
    }

    public static void BuildWalkSurface()
    {
        var grass = Photo("aerial_grass_rock", new Vector2(120f, 132f), new Color(0.78f, 0.82f, 0.66f))
            ?? Photo("Grass004", new Vector2(105f, 115f), new Color(0.72f, 0.78f, 0.62f))
            ?? PropKit.TexMat(PropKit.NoiseTex(new Color(0.28f, 0.4f, 0.22f), new Color(0.42f, 0.48f, 0.26f), 256, 0.04f), 0.05f);
        var asphalt = Photo("asphalt_02", new Vector2(4.1f, 70f), new Color(0.9f, 0.9f, 0.88f))
            ?? Photo("Asphalt012", new Vector2(4f, 70f), new Color(0.75f, 0.75f, 0.72f))
            ?? PropKit.TexMat(PropKit.NoiseTex(new Color(0.22f, 0.22f, 0.22f), new Color(0.32f, 0.32f, 0.32f), 128, 0.08f), 0.08f);
        Cube("Ground", new Vector3(0f, -0.5f, 40f), new Vector3(420f, 1f, 460f), grass, true);
        Cube("Road", new Vector3(0f, 0.012f, 40f), new Vector3(8.2f, 0.02f, 280f), asphalt, false);
        var paint = Mat(new Color(0.78f, 0.74f, 0.55f), 0.15f);
        for (float z = -28f; z < 120f; z += 8f)
            Cube("Dash", new Vector3(0f, 0.028f, z), new Vector3(0.12f, 0.008f, 1.6f), paint, false);
    }

    public void DressStreet()
    {
        // Lamps own x=±7.4 at z=-16,6,28,50,72,94 on the left and z=-5,17,39,61,83 on the right.
        Prop("modular_street_seating", new Vector3(-9.8f, 0f, 16f), 90f, 0.78f, true);
        Prop("modular_street_seating", new Vector3(9.8f, 0f, 28f), -90f, 0.78f, true);
        Prop("metal_trash_can", new Vector3(-6.1f, 0f, 20f), 0f, 0.9f, true);
        Prop("metal_trash_can", new Vector3(6.1f, 0f, 48f), 0f, 0.9f, true);
        Prop("wooden_picnic_table", new Vector3(-22f, 0f, -4f), 0f, 0.75f, true);
        Prop("plastic_monobloc_chair_01", new Vector3(-22f, 0f, -5.7f), 0f, 0.84f, true);
        Prop("plastic_monobloc_chair_01", new Vector3(-22f, 0f, -2.3f), 180f, 0.84f, true);
        Prop("covered_car", new Vector3(23f, 0f, 8f), 0f, 1.4f, true);
        Prop("concrete_road_barrier", new Vector3(-5.8f, 0f, 42f), 0f, 0.84f, true);
        Prop("cardboard_box_01", new Vector3(9.2f, 0f, 98f), 12f, 0.4f, true);
        Prop("steel_frame_shelves_01", new Vector3(9.6f, 0f, 108f), 0f, 2.0f, true);
    }

    void Prop(string id, Vector3 pos, float yaw, float height, bool solid)
    {
        PropKit.Spawn("Poly/" + id + "/" + id + "_1k", pos, Quaternion.Euler(0f, yaw, 0f), height, solid);
    }

    public void DressRoad()
    {
        for (float z = -16f; z < 100f; z += 22f)
        {
            VillageLook.Lamp(new Vector3(-7.4f, 0f, z), 90f);
            VillageLook.Lamp(new Vector3(7.4f, 0f, z + 11f), -90f);
        }
        var photoCrate = PropKit.Spawn("Poly/wooden_crate_01/wooden_crate_01_1k", new Vector3(5.7f, 0f, -9f), Quaternion.Euler(0f, 18f, 0f), 0.62f, true);
        if (photoCrate == null)
        {
            photoCrate = GameObject.CreatePrimitive(PrimitiveType.Cube);
            photoCrate.name = "Crate";
            photoCrate.transform.position = new Vector3(5.7f, 0.32f, -9f);
            photoCrate.transform.localScale = new Vector3(0.7f, 0.55f, 0.62f);
            photoCrate.GetComponent<Renderer>().sharedMaterial = Photo("wood_floor", new Vector2(1f, 1f), new Color(0.7f, 0.55f, 0.38f))
                ?? Mat(new Color(0.4f, 0.28f, 0.16f), 0.12f);
        }
        var loot = photoCrate.AddComponent<LootContainer>();
        loot.label = "Ящик";
        loot.items = Stacks(("bread", 1), ("water", 1), ("bandage", 1));
    }

    void DressYards(Vector3[] spots)
    {
        const string fern = "Poly/fern_02/fern_02_1k";
        const string bush = "Poly/shrub_02/shrub_02_1k";
        const string barrel = "Poly/barrel_03/barrel_03_1k";
        for (int i = 0; i < spots.Length; i++)
        {
            Vector3 s = spots[i];
            float away = s.x < 0f ? -6.8f : 6.8f;
            PropKit.Spawn(bush, s + new Vector3(away, 0f, 0.4f), Quaternion.Euler(0f, i * 37f, 0f), 1.15f, false);
            PropKit.Spawn(fern, s + new Vector3(away, 0f, -1.8f), Quaternion.Euler(0f, i * 20f, 0f), 0.48f, false);
            if (i % 2 == 1)
                PropKit.Spawn(barrel, s + new Vector3(away * 0.85f, 0f, 2.6f), Quaternion.identity, 0.92f, true);
        }
    }

    void PlaceCar(Vector3 pos, float yaw, bool drivable)
    {
        var car = PropKit.Spawn("Models/vehicles/sedan", pos, Quaternion.Euler(0f, yaw, 0f), 1.55f, true);
        if (car == null) return;
        Vehicle.Dress(car);
        if (drivable)
        {
            var v = car.AddComponent<Vehicle>();
            v.fuel = 35f;
        }
        else
        {
            var loot = car.AddComponent<LootContainer>();
            loot.label = "Багажник";
            loot.items = Stacks(("gas", 1), ("bandage", 1), ("ammo", 6));
        }
    }

    public static Material Photo(string name, Vector2 scale, Color tint)
    {
        var tex = Resources.Load<Texture2D>("Textures/" + name);
        if (tex == null) return null;
        var m = Mat(tint, 0.18f);
        m.mainTexture = tex;
        m.mainTextureScale = scale;
        if (m.HasProperty("_BaseMap"))
        {
            m.SetTexture("_BaseMap", tex);
            m.SetTextureScale("_BaseMap", scale);
        }
        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", tint);
        var nor = Resources.Load<Texture2D>("Textures/" + name + "_nor");
        if (nor != null && m.HasProperty("_BumpMap"))
        {
            m.SetTexture("_BumpMap", nor);
            m.SetFloat("_BumpScale", 0.8f);
            m.EnableKeyword("_NORMALMAP");
        }
        return m;
    }

    void SpawnZombie(Vector3 p)
    {
        var body = new GameObject("Zombie");
        body.transform.position = p;
        string path = Zombies[rng.Next(Zombies.Length)];
        var model = PropKit.Spawn(path, p, Quaternion.identity, 1.75f, false);
        if (model != null)
        {
            model.transform.SetParent(body.transform, true);
            foreach (var col in model.GetComponentsInChildren<Collider>()) Destroy(col);
            foreach (var r in model.GetComponentsInChildren<Renderer>())
            foreach (var mat in r.materials)
            {
                if (!mat.HasProperty("_BaseColor")) continue;
                var c = mat.GetColor("_BaseColor");
                mat.SetColor("_BaseColor", Color.Lerp(c, new Color(0.55f, 0.56f, 0.5f), 0.18f));
            }
        }
        else
        {
            var vis = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            Destroy(vis.GetComponent<Collider>());
            vis.transform.SetParent(body.transform, false);
            vis.transform.localPosition = new Vector3(0f, 0.95f, 0f);
        }
        var cc = body.AddComponent<CharacterController>();
        cc.height = 1.8f;
        cc.radius = 0.35f;
        cc.center = new Vector3(0f, 0.9f, 0f);
        var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        head.name = "Head";
        head.transform.SetParent(body.transform, false);
        head.transform.localPosition = new Vector3(0f, 1.62f, 0.06f);
        head.transform.localScale = Vector3.one * 0.26f;
        var headR = head.GetComponent<Renderer>();
        if (headR != null) headR.enabled = false;
        var z = body.AddComponent<Zombie>();
        z.target = player;
    }

    float Rng(float a, float b) => a + (float)rng.NextDouble() * (b - a);

    static ItemStack[] Stacks(params (string id, int qty)[] list)
    {
        var arr = new ItemStack[list.Length];
        for (int i = 0; i < list.Length; i++) arr[i] = new ItemStack { id = list[i].id, qty = list[i].qty };
        return arr;
    }

    ItemStack[] RandomHomeLoot()
    {
        var pool = new[] { "water", "can", "bread", "bandage", "ammo" };
        int n = rng.Next(1, 3);
        var list = new ItemStack[n];
        for (int i = 0; i < n; i++)
        {
            string id = pool[rng.Next(pool.Length)];
            list[i] = new ItemStack { id = id, qty = id == "ammo" ? rng.Next(4, 10) : 1 };
        }
        return list;
    }

    static GameObject Cube(string name, Vector3 center, Vector3 scale, Material mat, bool solid)
    {
        var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
        g.name = name;
        g.transform.position = center;
        g.transform.localScale = scale;
        g.GetComponent<Renderer>().sharedMaterial = mat;
        if (!solid)
        {
            var col = g.GetComponent<Collider>();
            if (col != null) PropKit.Release(col);
        }
        return g;
    }

    static GameObject Child(GameObject parent, string name, Vector3 localCenter, Vector3 scale, Material mat)
    {
        var g = Cube(name, parent.transform.position, scale, mat, true);
        g.transform.SetParent(parent.transform, false);
        g.transform.localPosition = localCenter;
        g.transform.localRotation = Quaternion.identity;
        return g;
    }
}

public class DayClock : MonoBehaviour
{
    public Light sun;
    float rainTimer = 40f;
    bool raining;
    ParticleSystem rain;

    void Update()
    {
        if (sun == null) return;
        // Stay in a low warm afternoon. A high grey noon is what made the village look flat.
        float u = Time.time / 540f;
        sun.transform.rotation = Quaternion.Euler(33f + Mathf.Sin(u) * 4f, -48f + u * 8f, 0f);
        sun.color = raining ? new Color(0.75f, 0.8f, 0.86f) : new Color(1f, 0.91f, 0.76f);
        sun.intensity = raining ? 0.7f : 1.38f;
        RenderSettings.fogColor = raining ? new Color(0.6f, 0.64f, 0.68f) : new Color(0.74f, 0.8f, 0.86f);
        VillageLook.TrackSun(sun);
        rainTimer -= Time.deltaTime;
        if (rainTimer <= 0f)
        {
            raining = !raining;
            rainTimer = raining ? 50f : 70f;
            if (raining && rain == null) rain = MakeRain();
            if (rain != null)
            {
                if (raining) rain.Play();
                else rain.Stop();
            }
        }
        Weather.Raining = raining && rain != null && rain.isPlaying;
    }

    ParticleSystem MakeRain()
    {
        var go = new GameObject("Rain");
        go.transform.SetParent(Camera.main != null ? Camera.main.transform : transform, false);
        go.transform.localPosition = new Vector3(0f, 8f, 0f);
        var ps = go.AddComponent<ParticleSystem>();
        var main = ps.main;
        main.startLifetime = 0.7f;
        main.startSpeed = 18f;
        main.startSize = 0.04f;
        main.maxParticles = 2000;
        main.simulationSpace = ParticleSystemSimulationSpace.World;
        var em = ps.emission;
        em.rateOverTime = 900f;
        var shape = ps.shape;
        shape.shapeType = ParticleSystemShapeType.Box;
        shape.scale = new Vector3(24f, 0.2f, 24f);
        var renderer = ps.GetComponent<ParticleSystemRenderer>();
        var shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
        if (shader == null) shader = Shader.Find("Particles/Standard Unlit");
        var mat = shader != null ? new Material(shader) : GreyboxWorld.Mat(Color.white, 0.2f);
        if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", new Color(0.75f, 0.8f, 0.85f, 0.45f));
        mat.color = new Color(0.75f, 0.8f, 0.85f, 0.45f);
        renderer.material = mat;
        return ps;
    }
}

public static class Weather
{
    public static bool Raining;
}
