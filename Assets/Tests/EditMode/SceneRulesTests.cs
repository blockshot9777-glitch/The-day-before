using System;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

// Locks the failures that already shipped: self-hits, open houses, snagging floors, stretched textures.
public class SceneRulesTests
{
    [Test]
    public void Knife_IgnoresPlayerCapsule_HitsHead()
    {
        var before = Roots();
        try
        {
            var player = BodyAt(new Vector3(0f, 0f, 0f));
            var head = Target("Head", new Vector3(0f, 1.35f, 1.7f), 0.4f);
            Physics.SyncTransforms();
            var origin = player.transform.position + new Vector3(0f, 1.68f, 0f);
            var hits = Physics.SphereCastAll(origin, 0.4f, Vector3.forward, 2.6f, ~0, QueryTriggerInteraction.Ignore);
            Assert.IsTrue(PlayerWeapons.TryPick(hits, out var best), "knife stopped on the player capsule");
            Assert.AreEqual(head.name, best.collider.name);
            Assert.IsNull(best.collider.GetComponentInParent<PlayerMotor>());
        }
        finally { KillNew(before); }
    }

    [Test]
    public void Knife_PicksNearestForeign()
    {
        var before = Roots();
        try
        {
            BodyAt(Vector3.zero);
            Target("Near", new Vector3(0f, 1.35f, 1.4f), 0.3f);
            Target("Far", new Vector3(0f, 1.35f, 2.3f), 0.3f);
            Physics.SyncTransforms();
            var hits = Physics.SphereCastAll(new Vector3(0f, 1.68f, 0f), 0.35f, Vector3.forward, 4f, ~0, QueryTriggerInteraction.Ignore);
            Assert.IsTrue(PlayerWeapons.TryPick(hits, out var best));
            Assert.AreEqual("Near", best.collider.name);
        }
        finally { KillNew(before); }
    }

    [Test]
    public void Knife_OnlyPlayer_Misses()
    {
        var before = Roots();
        try
        {
            BodyAt(Vector3.zero);
            Physics.SyncTransforms();
            var hits = Physics.SphereCastAll(new Vector3(0f, 1.68f, 0f), 0.4f, Vector3.forward, 2.6f, ~0, QueryTriggerInteraction.Ignore);
            Assert.IsFalse(PlayerWeapons.TryPick(hits, out _));
        }
        finally { KillNew(before); }
    }

    [Test]
    public void Headshot_DealsMore()
    {
        Assert.Greater(PlayerWeapons.DamageScale("Head"), PlayerWeapons.DamageScale("Body"));
    }

    [Test]
    public void FlatMesh_IsNotStretchedIntoAWall()
    {
        var card = GameObject.CreatePrimitive(PrimitiveType.Cube);
        try
        {
            card.transform.localScale = new Vector3(1f, 0.02f, 1f);
            PropKit.FitHeight(card, 2f, 0f);
            Assert.Less(card.GetComponent<Renderer>().bounds.size.y, 0.25f);
        }
        finally { UnityEngine.Object.DestroyImmediate(card); }
    }

    [Test]
    public void SolidMesh_ScalesToTargetHeight()
    {
        var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
        try
        {
            box.transform.localScale = new Vector3(0.4f, 0.8f, 0.4f);
            PropKit.FitHeight(box, 1.6f, 0f);
            Assert.AreEqual(1.6f, box.GetComponent<Renderer>().bounds.size.y, 0.08f);
        }
        finally { UnityEngine.Object.DestroyImmediate(box); }
    }

    [Test]
    public void WalkSurface_OnlyGroundIsSolid_AndTilesMatchTheWorld()
    {
        var before = Roots();
        try
        {
            GreyboxWorld.BuildWalkSurface();
            Physics.SyncTransforms();
            var ground = GameObject.Find("Ground");
            Assert.IsNotNull(ground);
            Assert.IsNotNull(ground.GetComponent<Collider>());
            var scale = ground.GetComponent<Renderer>().sharedMaterial.mainTextureScale;
            Assert.Greater(scale.x, 50f);
            Assert.Greater(scale.y, 50f);
            var road = GameObject.Find("Road");
            Assert.IsNotNull(road);
            Assert.IsNull(road.GetComponent<Collider>());
            Assert.Greater(road.GetComponent<Renderer>().sharedMaterial.mainTextureScale.y, 40f);
            Assert.IsNull(GameObject.Find("ShoulderL"));
            Assert.IsNull(GameObject.Find("ShoulderR"));
            foreach (var dash in GameObjectsNamed("Dash"))
                Assert.IsNull(dash.GetComponent<Collider>(), "road paint is blocking feet");
            var p1 = new Vector3(0f, 0.55f, -60f);
            var p2 = new Vector3(0f, 1.45f, -60f);
            bool blocked = Physics.CapsuleCast(p1, p2, 0.28f, Vector3.back, out var hit, 8f, ~0, QueryTriggerInteraction.Ignore);
            if (blocked)
                Assert.IsFalse(hit.collider.name is "Road" or "Dash" or "ShoulderL" or "ShoulderR", hit.collider.name);
        }
        finally { KillNew(before); }
    }

    [Test]
    public void House_ShellIsClosed_AndWallsTileBySize()
    {
        var before = Roots();
        try
        {
            VillageLook.Cottage(new Vector3(240f, 0f, 240f), 0f, 0, false, null, new System.Random(1));
            VillageLook.Cottage(new Vector3(240f, 0f, 270f), -90f, 1, false, null, new System.Random(2));
            Physics.SyncTransforms();
            int houses = 0;
            foreach (var root in NewRoots(before))
            {
                if (root.name != "House") continue;
                houses++;
                Seal(root.transform);
            }
            Assert.AreEqual(2, houses);
        }
        finally { KillNew(before); }
    }

    [Test]
    public void Street_LampsStayClearOfProps_AndDoNotBlock()
    {
        var before = Roots();
        try
        {
            var world = new GameObject("Dress").AddComponent<GreyboxWorld>();
            world.DressRoad();
            world.DressStreet();
            Physics.SyncTransforms();
            var lamps = new List<Bounds>();
            var others = new List<(string name, Bounds bounds)>();
            foreach (var root in NewRoots(before))
            {
                if (root == world.gameObject) continue;
                var renderers = root.GetComponentsInChildren<Renderer>();
                if (renderers.Length == 0) continue;
                var b = renderers[0].bounds;
                for (int i = 1; i < renderers.Length; i++) b.Encapsulate(renderers[i].bounds);
                bool lamp = root.name.IndexOf("street_lamp", StringComparison.OrdinalIgnoreCase) >= 0 || root.name == "Lamp";
                if (lamp)
                {
                    lamps.Add(b);
                    foreach (var col in root.GetComponentsInChildren<Collider>())
                        Assert.IsNull(col, root.name + " still has a collider");
                }
                else others.Add((root.name, b));
            }
            Assert.Greater(lamps.Count, 0, "street lamp model did not spawn");
            foreach (var lamp in lamps)
            foreach (var other in others)
                Assert.IsFalse(DeepOverlap(lamp, other.bounds, 0.2f), "lamp intersects " + other.name);
        }
        finally { KillNew(before); }
    }

    [Test]
    public void NoTeleportHelpersLeftInTheProject()
    {
        string[] banned = { "PlayAudit", "PlayAuditOnce", "StreetShot", "PlayStreetOnce", "VerifyShot", "AutoPlayOnce", "ReimportPolyOnce" };
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        foreach (var name in banned)
            Assert.IsNull(asm.GetType(name), name);
    }

    static void Seal(Transform house)
    {
        int glass = 0;
        bool floor = false, ceiling = false, door = false;
        Vector2 firstScale = default;
        bool sawWall = false, scalesDiffer = false;
        float biggest = 0f;
        foreach (var r in house.GetComponentsInChildren<Renderer>())
        {
            if (r.name == "Glass") glass++;
            if (r.name == "Floor") floor = true;
            if (r.name == "Ceiling") ceiling = true;
            if (r.name == "Door") door = true;
            if (r.name != "Wall") continue;
            var st = r.sharedMaterial.mainTextureScale;
            biggest = Mathf.Max(biggest, Mathf.Max(st.x, st.y));
            if (!sawWall) firstScale = st;
            else if ((st - firstScale).sqrMagnitude > 0.04f) scalesDiffer = true;
            sawWall = true;
        }
        Assert.GreaterOrEqual(glass, 6, "open window");
        Assert.IsTrue(floor, "floor");
        Assert.IsTrue(ceiling, "ceiling");
        Assert.IsTrue(door, "door");
        Assert.Greater(biggest, 1.4f, "wall texture is stretched across the whole face");
        Assert.IsTrue(scalesDiffer, "every wall shares one texture scale");

        const float hx = 4.2f;
        const float hz = 3.3f;
        float[] heights = { 0.55f, 1.45f, 2.4f };
        foreach (float y in heights)
        {
            for (float x = -hx; x <= hx + 0.01f; x += 0.35f)
            {
                AssertNoEscape(house, y, new Vector3(x, y, -hz));
                AssertNoEscape(house, y, new Vector3(x, y, hz));
            }
            for (float z = -hz; z <= hz + 0.01f; z += 0.35f)
            {
                AssertNoEscape(house, y, new Vector3(-hx, y, z));
                AssertNoEscape(house, y, new Vector3(hx, y, z));
            }
        }
        AssertNoEscapeDir(house, new Vector3(0f, 1.3f, 0f), Vector3.up, 2.2f);
        AssertNoEscapeDir(house, new Vector3(0f, 1.3f, 0f), Vector3.down, 1.6f);
    }

    static void AssertNoEscape(Transform house, float y, Vector3 localPoint)
    {
        Vector3 originLocal = new Vector3(0f, y, 0f);
        Vector3 dir = localPoint - originLocal;
        AssertNoEscapeDir(house, originLocal, dir, dir.magnitude + 0.4f);
    }

    static void AssertNoEscapeDir(Transform house, Vector3 localOrigin, Vector3 localDir, float reach)
    {
        Vector3 origin = house.TransformPoint(localOrigin);
        Vector3 dir = house.TransformDirection(localDir.normalized);
        var hits = Physics.RaycastAll(origin, dir, reach, ~0, QueryTriggerInteraction.Ignore);
        foreach (var hit in hits)
        {
            if (hit.collider != null && hit.collider.transform.IsChildOf(house)) return;
        }
        foreach (var r in house.GetComponentsInChildren<Renderer>())
        {
            if (!Seals(r.name)) continue;
            if (r.bounds.IntersectRay(new Ray(origin, dir), out float dist) && dist <= reach) return;
        }
        Assert.Fail("hole at local " + localOrigin + " toward " + localDir);
    }

    static bool Seals(string name)
    {
        switch (name)
        {
            case "Wall":
            case "Floor":
            case "Ceiling":
            case "Foundation":
            case "Glass":
            case "Board":
            case "Door":
            case "Frame":
            case "Mullion":
            case "Gable":
            case "RoofL":
            case "RoofR":
                return true;
            default:
                return false;
        }
    }

    static bool DeepOverlap(Bounds a, Bounds b, float pen)
    {
        if (!a.Intersects(b)) return false;
        Vector3 min = Vector3.Max(a.min, b.min);
        Vector3 max = Vector3.Min(a.max, b.max);
        Vector3 size = max - min;
        return size.x > pen && size.y > pen && size.z > pen;
    }

    static GameObject BodyAt(Vector3 pos)
    {
        var go = new GameObject("Player");
        go.transform.position = pos;
        var cc = go.AddComponent<CharacterController>();
        cc.height = 1.8f;
        cc.radius = 0.35f;
        cc.center = new Vector3(0f, 0.9f, 0f);
        go.AddComponent<PlayerMotor>();
        return go;
    }

    static GameObject Target(string name, Vector3 pos, float size)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        go.transform.position = pos;
        go.transform.localScale = Vector3.one * size;
        return go;
    }

    static IEnumerable<GameObject> GameObjectsNamed(string name)
    {
        foreach (var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsInactive.Exclude))
            if (go.name == name) yield return go;
    }

    static List<GameObject> Roots()
    {
        var list = new List<GameObject>();
        foreach (var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsInactive.Exclude))
            if (go.transform.parent == null) list.Add(go);
        return list;
    }

    static List<GameObject> NewRoots(List<GameObject> before)
    {
        var list = new List<GameObject>();
        foreach (var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsInactive.Exclude))
        {
            if (go.transform.parent != null) continue;
            bool known = false;
            for (int i = 0; i < before.Count; i++)
                if (before[i] == go) { known = true; break; }
            if (!known) list.Add(go);
        }
        return list;
    }

    static void KillNew(List<GameObject> before)
    {
        foreach (var go in NewRoots(before))
            UnityEngine.Object.DestroyImmediate(go);
    }
}
