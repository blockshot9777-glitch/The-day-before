using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// Afternoon grade, closed cottages and broadleaf trees. Replaces the grey boxes and toon kits.
public static class VillageLook
{
    public static Material sky;

    struct Hole
    {
        public float a, b, y0, y1;
        public Hole(float a, float b, float y0, float y1) { this.a = a; this.b = b; this.y0 = y0; this.y1 = y1; }
    }

    public static Light Atmosphere()
    {
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.Linear;
        RenderSettings.fogColor = new Color(0.74f, 0.8f, 0.86f);
        RenderSettings.fogStartDistance = 70f;
        RenderSettings.fogEndDistance = 250f;
        QualitySettings.shadowDistance = 100f;

        var sunGo = new GameObject("Sun");
        var sun = sunGo.AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.color = new Color(1f, 0.91f, 0.76f);
        sun.intensity = 1.38f;
        sun.shadows = LightShadows.Soft;
        sun.shadowStrength = 0.78f;
        sunGo.transform.rotation = Quaternion.Euler(34f, -42f, 0f);
        RenderSettings.sun = sun;

        var hdr = Resources.Load<Texture>("Sky/lonely_road_afternoon_puresky_2k");
        var panoramic = Shader.Find("Skybox/Panoramic");
        if (hdr != null && panoramic != null)
        {
            var mat = new Material(panoramic);
            mat.SetTexture("_MainTex", hdr);
            mat.SetFloat("_Mapping", 1f);
            mat.SetFloat("_ImageType", 0f);
            mat.SetFloat("_Exposure", 0.85f);
            mat.SetFloat("_Rotation", 18f);
            RenderSettings.skybox = mat;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.64f, 0.66f, 0.68f);
            RenderSettings.ambientEquatorColor = new Color(0.78f, 0.68f, 0.52f);
            RenderSettings.ambientGroundColor = new Color(0.24f, 0.2f, 0.14f);
            RenderSettings.ambientIntensity = 1f;
        }
        else
        {
            var shader = Shader.Find("Survival/WarmSky");
            if (shader != null)
            {
                sky = new Material(shader);
                sky.SetColor("_Top", new Color(0.2f, 0.4f, 0.68f));
                sky.SetColor("_Hor", new Color(0.58f, 0.66f, 0.74f));
                sky.SetColor("_Bot", new Color(0.4f, 0.38f, 0.32f));
                sky.SetColor("_SunCol", new Color(1f, 0.9f, 0.7f));
                RenderSettings.skybox = sky;
                RenderSettings.ambientMode = AmbientMode.Skybox;
                RenderSettings.ambientIntensity = 0.85f;
            }
            else
            {
                RenderSettings.ambientMode = AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = new Color(0.62f, 0.72f, 0.86f);
                RenderSettings.ambientEquatorColor = new Color(0.72f, 0.64f, 0.5f);
                RenderSettings.ambientGroundColor = new Color(0.22f, 0.18f, 0.12f);
            }
        }
        TrackSun(sun);
        Grade();
        return sun;
    }

    public static void TrackSun(Light sun)
    {
        if (sky == null || sun == null) return;
        sky.SetVector("_SunDir", -sun.transform.forward);
    }

    static void Grade()
    {
        var cam = Camera.main;
        if (cam == null) return;
        cam.clearFlags = CameraClearFlags.Skybox;
        cam.allowHDR = true;
        var data = cam.GetUniversalAdditionalCameraData();
        data.renderPostProcessing = true;
        data.antialiasing = AntialiasingMode.FastApproximateAntialiasing;
        data.dithering = true;

        var go = new GameObject("Grade");
        var vol = go.AddComponent<Volume>();
        vol.isGlobal = true;
        var profile = ScriptableObject.CreateInstance<VolumeProfile>();
        vol.sharedProfile = profile;

        var tone = profile.Add<Tonemapping>(true);
        tone.mode.Override(TonemappingMode.ACES);
        var color = profile.Add<ColorAdjustments>(true);
        color.postExposure.Override(0.02f);
        color.contrast.Override(14f);
        color.saturation.Override(10f);
        color.colorFilter.Override(new Color(1f, 0.97f, 0.92f));
        var bloom = profile.Add<Bloom>(true);
        bloom.threshold.Override(1.15f);
        bloom.intensity.Override(0.06f);
        bloom.scatter.Override(0.65f);
        var vig = profile.Add<Vignette>(true);
        vig.intensity.Override(0.2f);
        vig.smoothness.Override(0.42f);
        var split = profile.Add<SplitToning>(true);
        split.shadows.Override(new Color(0.28f, 0.38f, 0.52f));
        split.highlights.Override(new Color(1f, 0.88f, 0.7f));
        split.balance.Override(-8f);
    }

    public static void Cottage(Vector3 pos, float yaw, int style, bool furnish, ItemStack[] loot, System.Random rng)
    {
        var tint = style switch
        {
            1 => new Color(0.92f, 0.7f, 0.48f),
            2 => new Color(0.7f, 0.76f, 0.62f),
            3 => new Color(0.62f, 0.56f, 0.5f),
            _ => new Color(0.9f, 0.8f, 0.66f),
        };
        Shell(pos, yaw, 8.4f, 6.6f, 2.5f, style == 3, tint, true, style % 2 == 0, furnish, false, loot, "Ящик", rng);
    }

    public static void Shop(Vector3 pos, ItemStack[] loot)
    {
        Shell(pos, 0f, 13.5f, 8.2f, 3.05f, true, new Color(0.78f, 0.74f, 0.7f), true, false, false, true, loot, "Прилавок", new System.Random(3));
    }

    static void Shell(Vector3 pos, float yaw, float w, float d, float wallH, bool brick, Color tint, bool porch, bool chimney, bool furnish, bool shop, ItemStack[] loot, string label, System.Random rng)
    {
        var root = new GameObject(shop ? "Shop" : "House").transform;
        root.position = pos;
        root.rotation = Quaternion.Euler(0f, yaw, 0f);

        float thick = 0.2f;
        float baseH = 0.22f;
        float top = baseH + wallH;
        float hx = w * 0.5f;
        float hz = d * 0.5f;

        var plaster = GreyboxWorld.Photo(brick ? "red_brick" : "painted_plaster_wall", brick ? new Vector2(2.4f, 1.1f) : new Vector2(1.8f, 1.2f), tint)
            ?? GreyboxWorld.Mat(tint, 0.18f);
        var brickMat = GreyboxWorld.Photo("red_brick", new Vector2(2f, 0.6f), new Color(0.75f, 0.7f, 0.66f))
            ?? GreyboxWorld.Mat(new Color(0.45f, 0.28f, 0.22f), 0.12f);
        var wood = GreyboxWorld.Photo("wood_floor", new Vector2(1.6f, 1.2f), new Color(0.78f, 0.66f, 0.5f))
            ?? GreyboxWorld.Mat(new Color(0.4f, 0.28f, 0.16f), 0.15f);
        var woodDark = GreyboxWorld.Photo("wood_floor", new Vector2(1.2f, 2f), new Color(0.42f, 0.28f, 0.16f))
            ?? GreyboxWorld.Mat(new Color(0.28f, 0.18f, 0.1f), 0.12f);
        var roofMat = GreyboxWorld.Photo("roof_tiles", new Vector2(3.2f, 1.8f), new Color(0.92f, 0.86f, 0.8f))
            ?? GreyboxWorld.Mat(new Color(0.55f, 0.28f, 0.18f), 0.15f);
        var dirt = GreyboxWorld.Photo("Ground037", new Vector2(2f, 2f), new Color(0.7f, 0.62f, 0.5f))
            ?? GreyboxWorld.Mat(new Color(0.38f, 0.3f, 0.2f), 0.08f);
        var glass = Glass();

        Box(root, "Yard", new Vector3(0f, 0.015f, 0f), new Vector3(w + 2.2f, 0.02f, d + 2.4f), dirt);
        Box(root, "Foundation", new Vector3(0f, baseH * 0.5f, 0f), new Vector3(w + 0.08f, baseH, d + 0.08f), brickMat);
        Box(root, "Floor", new Vector3(0f, baseH - 0.02f, 0f), new Vector3(w - 0.04f, 0.06f, d - 0.04f), wood);
        var ceilingMat = GreyboxWorld.Photo("wood_floor", new Vector2(1.2f, 2f), new Color(0.72f, 0.58f, 0.4f))
            ?? GreyboxWorld.Mat(new Color(0.45f, 0.32f, 0.2f), 0.12f);
        Box(root, "Ceiling", new Vector3(0f, top - 0.04f, 0f), new Vector3(w + 0.04f, 0.08f, d + 0.04f), ceilingMat);

        float winW = 1.15f;
        float winY0 = baseH + 0.82f;
        float winY1 = baseH + 1.95f;
        float doorW = shop ? 1.55f : 1.02f;
        var front = new[]
        {
            new Hole(-hx + 1.15f, -hx + 1.15f + winW, winY0, winY1),
            new Hole(-doorW * 0.5f, doorW * 0.5f, baseH, baseH + 2.08f),
            new Hole(hx - 1.15f - winW, hx - 1.15f, winY0, winY1),
        };
        WallX(root, -hz, thick, -hx, hx, baseH, top, plaster, front);
        WallX(root, hz, thick, -hx, hx, baseH, top, plaster, new[]
        {
            new Hole(-0.7f, 0.55f, winY0, winY1),
        });
        var side = new[]
        {
            new Hole(-hz * 0.55f, -hz * 0.55f + winW, winY0, winY1),
            new Hole(hz * 0.15f, hz * 0.15f + winW, winY0, winY1),
        };
        WallZ(root, -hx, thick, -hz, hz, baseH, top, plaster, side);
        WallZ(root, hx, thick, -hz, hz, baseH, top, plaster, side);
        foreach (var h in side)
        {
            WindowSide(root, -hx, (h.a + h.b) * 0.5f, (h.y0 + h.y1) * 0.5f, (h.b - h.a) * 0.5f, (h.y1 - h.y0) * 0.5f, woodDark, glass, rng);
            WindowSide(root, hx, (h.a + h.b) * 0.5f, (h.y0 + h.y1) * 0.5f, (h.b - h.a) * 0.5f, (h.y1 - h.y0) * 0.5f, woodDark, glass, rng);
        }

        foreach (var h in front)
            Window(root, (h.a + h.b) * 0.5f, (h.y0 + h.y1) * 0.5f, -hz, (h.b - h.a) * 0.5f, (h.y1 - h.y0) * 0.5f, true, h.y0 <= baseH + 0.01f, woodDark, glass, rng);
        Window(root, 0f, (winY0 + winY1) * 0.5f, hz, 0.62f, (winY1 - winY0) * 0.5f, true, false, woodDark, glass, rng);

        float pitch = 27f * Mathf.Deg2Rad;
        float oh = 0.42f;
        float rise = hx * Mathf.Tan(pitch);
        float ridgeY = top + rise;
        Roof(root, hx, hz, top, oh, pitch, roofMat, woodDark);
        Gable(root, -hz - thick * 0.5f - 0.02f, hx, top, ridgeY, wood);
        Gable(root, hz + thick * 0.5f + 0.02f, hx, top, ridgeY, wood);

        var hinge = new GameObject("DoorHinge");
        hinge.transform.SetParent(root, false);
        hinge.transform.localPosition = new Vector3(-doorW * 0.5f, 0f, -hz);
        float doorH = 2.16f;
        Box(hinge.transform, "Door", new Vector3(doorW * 0.5f, baseH + doorH * 0.5f, 0f), new Vector3(doorW - 0.02f, doorH, 0.18f), woodDark);
        Box(hinge.transform, "Knob", new Vector3(doorW - 0.14f, baseH + 1.0f, 0.05f), new Vector3(0.06f, 0.06f, 0.04f), GreyboxWorld.Mat(new Color(0.55f, 0.5f, 0.4f), 0.6f));
        hinge.AddComponent<Door>();

        if (porch)
        {
            float pz = -hz - 1.05f;
            Box(root, "Post", new Vector3(-doorW * 0.5f - 0.45f, baseH + 1.05f, pz), new Vector3(0.12f, 2.1f, 0.12f), woodDark);
            Box(root, "Post", new Vector3(doorW * 0.5f + 0.45f, baseH + 1.05f, pz), new Vector3(0.12f, 2.1f, 0.12f), woodDark);
            Box(root, "Awning", new Vector3(0f, baseH + 2.16f, -hz - 0.7f), new Vector3(doorW + 1.3f, 0.08f, 1.45f), roofMat);
            Box(root, "Step", new Vector3(0f, baseH * 0.35f, -hz - 0.7f), new Vector3(doorW + 0.4f, baseH * 0.7f, 0.7f), brickMat);
            FenceRun(root, woodDark, hx, hz, baseH);
        }
        Box(root, "Path", new Vector3(0f, 0.035f, -hz - 2.15f), new Vector3(1.15f, 0.04f, 2.4f), dirt);

        if (chimney)
        {
            float y1 = ridgeY + 0.7f;
            float y0 = top + 0.4f;
            Box(root, "Chimney", new Vector3(hx * 0.36f, (y0 + y1) * 0.5f, 0.35f), new Vector3(0.48f, y1 - y0, 0.48f), brickMat);
        }

        if (shop)
        {
            Box(root, "Fascia", new Vector3(0f, top - 0.18f, -hz - thick * 0.5f - 0.04f), new Vector3(w * 0.72f, 0.42f, 0.06f), GreyboxWorld.Mat(new Color(0.42f, 0.1f, 0.08f), 0.2f));
            var counter = Box(root, "Counter", new Vector3(0f, baseH + 0.5f, 1.3f), new Vector3(4.2f, 1f, 0.85f), wood);
            var lootBox = counter.AddComponent<LootContainer>();
            lootBox.label = label;
            lootBox.items = loot ?? System.Array.Empty<ItemStack>();
        }
        else
        {
            var crate = Box(root, "Crate", new Vector3(hx - 1.3f, baseH + 0.32f, hz - 1.15f), new Vector3(0.72f, 0.64f, 0.55f), wood);
            var lootBox = crate.AddComponent<LootContainer>();
            lootBox.label = label;
            lootBox.items = loot ?? System.Array.Empty<ItemStack>();
            if (furnish) Furnish(root, baseH);
        }

        var lightGo = new GameObject("RoomLight");
        lightGo.transform.SetParent(root, false);
        lightGo.transform.localPosition = new Vector3(0f, top - 0.45f, 0f);
        var l = lightGo.AddComponent<Light>();
        l.type = LightType.Point;
        l.range = 8f;
        l.intensity = 2.4f;
        l.color = new Color(1f, 0.78f, 0.55f);
        l.shadows = LightShadows.None;
    }

    static void Furnish(Transform root, float floor)
    {
        if (Resources.Load<GameObject>("Poly/GothicBed_01/GothicBed_01_1k") != null)
        {
            Place("Poly/GothicBed_01/GothicBed_01_1k", root, new Vector3(-2.05f, floor, 1.05f), 1.15f);
            Place("Poly/wooden_table_02/wooden_table_02_1k", root, new Vector3(1.45f, floor, -0.95f), 0.75f);
            Place("Poly/painted_wooden_chair_01/painted_wooden_chair_01_1k", root, new Vector3(1.7f, floor, 0.05f), 0.9f);
            Place("Poly/ArmChair_01/ArmChair_01_1k", root, new Vector3(0.05f, floor, 1.25f), 0.95f);
            Place("Poly/vintage_cabinet_01/vintage_cabinet_01_1k", root, new Vector3(2.45f, floor, 1.35f), 1.8f);
            Place("Poly/side_table_01/side_table_01_1k", root, new Vector3(-0.15f, floor, -1.2f), 0.52f);
            Place("Poly/Lantern_01/Lantern_01_1k", root, new Vector3(1.45f, floor + 0.76f, -0.95f), 0.28f);
            return;
        }
        Place("Kenney/furniture/bedDouble", root, new Vector3(-2.2f, floor, 1.3f), 0.65f);
        Place("Kenney/furniture/table", root, new Vector3(0.4f, floor, 0.1f), 0.72f);
        Place("Kenney/furniture/chair", root, new Vector3(1.15f, floor, -0.55f), 0.85f);
        Place("Kenney/furniture/kitchenFridge", root, new Vector3(2.3f, floor, 1.5f), 1.65f);
    }

    static void FenceRun(Transform root, Material wood, float hx, float hz, float baseH)
    {
        float z = -hz - 2.55f;
        float y = baseH + 0.48f;
        Box(root, "Rail", new Vector3(-hx * 0.55f, y, z), new Vector3(hx * 0.7f, 0.08f, 0.08f), wood);
        Box(root, "Rail", new Vector3(-hx * 0.55f, y + 0.38f, z), new Vector3(hx * 0.7f, 0.08f, 0.08f), wood);
        Box(root, "Rail", new Vector3(hx * 0.55f, y, z), new Vector3(hx * 0.7f, 0.08f, 0.08f), wood);
        Box(root, "Rail", new Vector3(hx * 0.55f, y + 0.38f, z), new Vector3(hx * 0.7f, 0.08f, 0.08f), wood);
        for (int i = -2; i <= 2; i++)
        {
            if (i == 0) continue;
            Box(root, "Post", new Vector3(i * hx * 0.42f, baseH + 0.55f, z), new Vector3(0.1f, 1.15f, 0.1f), wood);
        }
    }

    static void Window(Transform root, float cx, float cy, float z, float hw, float hh, bool faceZ, bool door, Material wood, Material glass, System.Random rng)
    {
        if (door) return;
        float face = z + (z < 0f ? -0.12f : 0.12f);
        Box(root, "Frame", new Vector3(cx - hw, cy, face), new Vector3(0.07f, hh * 2f, 0.06f), wood);
        Box(root, "Frame", new Vector3(cx + hw, cy, face), new Vector3(0.07f, hh * 2f, 0.06f), wood);
        Box(root, "Frame", new Vector3(cx, cy + hh, face), new Vector3(hw * 2f, 0.07f, 0.06f), wood);
        Box(root, "Frame", new Vector3(cx, cy - hh, face), new Vector3(hw * 2f + 0.08f, 0.06f, 0.1f), wood);
        Box(root, "Glass", new Vector3(cx, cy, face + (z < 0f ? 0.03f : -0.03f)), new Vector3(hw * 2.05f, hh * 2.05f, 0.03f), glass);
        Box(root, "Mullion", new Vector3(cx, cy, face), new Vector3(0.045f, hh * 2f - 0.1f, 0.05f), wood);
        if (rng != null && rng.Next(7) == 0)
        {
            for (int i = -1; i <= 1; i++)
                Box(root, "Board", new Vector3(cx, cy + i * hh * 0.62f, face), new Vector3(hw * 2.1f, hh * 0.78f, 0.05f), wood);
        }
    }

    static void WindowSide(Transform root, float x, float cz, float cy, float hw, float hh, Material wood, Material glass, System.Random rng)
    {
        float face = x + (x < 0f ? -0.12f : 0.12f);
        Box(root, "Frame", new Vector3(face, cy, cz - hw), new Vector3(0.06f, hh * 2f, 0.07f), wood);
        Box(root, "Frame", new Vector3(face, cy, cz + hw), new Vector3(0.06f, hh * 2f, 0.07f), wood);
        Box(root, "Frame", new Vector3(face, cy + hh, cz), new Vector3(0.06f, 0.07f, hw * 2f), wood);
        Box(root, "Frame", new Vector3(face, cy - hh, cz), new Vector3(0.1f, 0.06f, hw * 2f + 0.08f), wood);
        Box(root, "Glass", new Vector3(face + (x < 0f ? 0.03f : -0.03f), cy, cz), new Vector3(0.03f, hh * 2.05f, hw * 2.05f), glass);
        if (rng != null && rng.Next(7) == 0)
        {
            for (int i = -1; i <= 1; i++)
                Box(root, "Board", new Vector3(face, cy, cz + i * hw * 0.62f), new Vector3(0.05f, hh * 0.78f, hw * 2.1f), wood);
        }
    }

    static void Roof(Transform root, float hx, float hz, float wallTop, float oh, float pitch, Material tiles, Material wood)
    {
        float rise = hx * Mathf.Tan(pitch);
        float eaveDrop = oh * Mathf.Tan(pitch);
        float ridgeY = wallTop + rise;
        float eaveY = wallTop - eaveDrop;
        float slope = (hx + oh) / Mathf.Cos(pitch);
        float depth = (hz + oh) * 2f;
        float thick = 0.09f;
        var leftEave = new Vector3(-(hx + oh), eaveY, 0f);
        var rightEave = new Vector3(hx + oh, eaveY, 0f);
        var ridge = new Vector3(0f, ridgeY, 0f);
        var left = Box(root, "RoofL", (leftEave + ridge) * 0.5f, new Vector3(slope, thick, depth), tiles);
        left.transform.localRotation = Quaternion.Euler(0f, 0f, pitch * Mathf.Rad2Deg);
        var right = Box(root, "RoofR", (rightEave + ridge) * 0.5f, new Vector3(slope, thick, depth), tiles);
        right.transform.localRotation = Quaternion.Euler(0f, 0f, -pitch * Mathf.Rad2Deg);
        Box(root, "Ridge", new Vector3(0f, ridgeY + 0.05f, 0f), new Vector3(0.22f, 0.08f, depth), wood);
        Box(root, "Fascia", new Vector3(-(hx + oh), eaveY, 0f), new Vector3(0.08f, 0.16f, depth), wood);
        Box(root, "Fascia", new Vector3(hx + oh, eaveY, 0f), new Vector3(0.08f, 0.16f, depth), wood);
    }

    static void Gable(Transform root, float z, float hx, float wallTop, float ridgeY, Material mat)
    {
        var go = new GameObject("Gable");
        go.transform.SetParent(root, false);
        go.transform.localPosition = new Vector3(0f, 0f, z);
        var mesh = new Mesh();
        mesh.vertices = new[]
        {
            new Vector3(-hx, wallTop, 0f),
            new Vector3(hx, wallTop, 0f),
            new Vector3(0f, ridgeY, 0f),
        };
        // One winding. Opposite triangles cancel the normal and the gable renders black.
        mesh.triangles = new[] { 0, 2, 1 };
        mesh.uv = new[] { new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(0.5f, 1f) };
        mesh.RecalculateNormals();
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        var show = new Material(mat);
        if (show.HasProperty("_Cull")) show.SetFloat("_Cull", 0f);
        go.AddComponent<MeshRenderer>().sharedMaterial = show;
        go.AddComponent<MeshCollider>().sharedMesh = mesh;
    }

    static void WallX(Transform root, float z, float thick, float x0, float x1, float y0, float y1, Material mat, Hole[] holes)
    {
        System.Array.Sort(holes, (p, q) => p.a.CompareTo(q.a));
        float c = x0;
        foreach (var h in holes)
        {
            Solid(root, new Vector3((c + h.a) * 0.5f, (y0 + y1) * 0.5f, z), new Vector3(h.a - c, y1 - y0, thick), mat);
            Solid(root, new Vector3((h.a + h.b) * 0.5f, (y0 + h.y0) * 0.5f, z), new Vector3(h.b - h.a, h.y0 - y0, thick), mat);
            Solid(root, new Vector3((h.a + h.b) * 0.5f, (h.y1 + y1) * 0.5f, z), new Vector3(h.b - h.a, y1 - h.y1, thick), mat);
            c = h.b;
        }
        Solid(root, new Vector3((c + x1) * 0.5f, (y0 + y1) * 0.5f, z), new Vector3(x1 - c, y1 - y0, thick), mat);
    }

    static void WallZ(Transform root, float x, float thick, float z0, float z1, float y0, float y1, Material mat, Hole[] holes)
    {
        System.Array.Sort(holes, (p, q) => p.a.CompareTo(q.a));
        float c = z0;
        foreach (var h in holes)
        {
            Solid(root, new Vector3(x, (y0 + y1) * 0.5f, (c + h.a) * 0.5f), new Vector3(thick, y1 - y0, h.a - c), mat);
            Solid(root, new Vector3(x, (y0 + h.y0) * 0.5f, (h.a + h.b) * 0.5f), new Vector3(thick, h.y0 - y0, h.b - h.a), mat);
            Solid(root, new Vector3(x, (h.y1 + y1) * 0.5f, (h.a + h.b) * 0.5f), new Vector3(thick, y1 - h.y1, h.b - h.a), mat);
            c = h.b;
        }
        Solid(root, new Vector3(x, (y0 + y1) * 0.5f, (c + z1) * 0.5f), new Vector3(thick, y1 - y0, z1 - c), mat);
    }

    static void Solid(Transform root, Vector3 center, Vector3 size, Material mat)
    {
        if (size.x < 0.03f || size.y < 0.03f || size.z < 0.03f) return;
        Box(root, "Wall", center, size, mat);
    }

    public static void Tree(Vector3 pos, float yaw, float height, int kind)
    {
        var root = new GameObject("Tree").transform;
        root.position = pos;
        root.rotation = Quaternion.Euler(0f, yaw, 0f);
        bool pine = kind == 1;
        float trunkH = height * (pine ? 0.62f : 0.42f);
        var bark = GreyboxWorld.Photo("wood_floor", new Vector2(0.4f, 1.6f), new Color(0.55f, 0.4f, 0.28f))
            ?? GreyboxWorld.Mat(new Color(0.32f, 0.22f, 0.13f), 0.08f);
        var trunk = new GameObject("Trunk");
        trunk.transform.SetParent(root, false);
        trunk.AddComponent<MeshFilter>().sharedMesh = TrunkMesh(trunkH, pine ? 0.16f : 0.24f, pine ? 0.05f : 0.08f);
        trunk.AddComponent<MeshRenderer>().sharedMaterial = bark;
        var cap = trunk.AddComponent<CapsuleCollider>();
        cap.center = new Vector3(0f, trunkH * 0.45f, 0f);
        cap.height = trunkH * 0.9f;
        cap.radius = 0.2f;

        var tint = pine
            ? new Color(0.45f, 0.62f, 0.38f)
            : (kind == 2 ? new Color(0.72f, 0.62f, 0.28f) : new Color(0.5f, 0.68f, 0.32f));
        var block = new MaterialPropertyBlock();
        block.SetColor("_BaseColor", tint);
        var mass = new MaterialPropertyBlock();
        mass.SetColor("_BaseColor", pine ? new Color(0.14f, 0.26f, 0.12f) : kind == 2 ? new Color(0.38f, 0.32f, 0.1f) : new Color(0.18f, 0.32f, 0.11f));
        int clumps = pine ? 4 : 3;
        for (int i = 0; i < clumps; i++)
        {
            float t = (i + 1f) / (clumps + 0.2f);
            float y = trunkH * (pine ? 0.45f : 0.7f) + t * height * (pine ? 0.4f : 0.28f);
            float size = height * (pine ? 0.22f : 0.34f) * (1f - t * 0.45f);
            var ball = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Object.Destroy(ball.GetComponent<Collider>());
            ball.name = "Crown";
            ball.transform.SetParent(root, false);
            ball.transform.localPosition = new Vector3((i - 1) * 0.15f, y, 0f);
            ball.transform.localScale = new Vector3(size * 0.72f, size * (pine ? 0.55f : 0.48f), size * 0.66f);
            var br = ball.GetComponent<Renderer>();
            br.sharedMaterial = Canopy();
            br.SetPropertyBlock(mass);
            for (int k = 0; k < 3; k++)
            {
                var card = GameObject.CreatePrimitive(PrimitiveType.Quad);
                Object.Destroy(card.GetComponent<Collider>());
                card.name = "Leaf";
                card.transform.SetParent(root, false);
                card.transform.localPosition = new Vector3(0f, y, 0f);
                card.transform.localRotation = Quaternion.Euler(pine ? 8f : 4f, k * 60f + i * 18f, 0f);
                card.transform.localScale = new Vector3(size, size * (pine ? 0.85f : 0.72f), 1f);
                var rend = card.GetComponent<Renderer>();
                rend.sharedMaterial = Leaves();
                rend.SetPropertyBlock(block);
                rend.shadowCastingMode = ShadowCastingMode.Off;
            }
        }
    }

    static Mesh TrunkMesh(float height, float r0, float r1)
    {
        int sides = 6;
        int rings = 4;
        var verts = new Vector3[(rings + 1) * sides];
        var uv = new Vector2[verts.Length];
        for (int r = 0; r <= rings; r++)
        {
            float t = r / (float)rings;
            float rad = Mathf.Lerp(r0, r1, t);
            float y = height * t;
            for (int s = 0; s < sides; s++)
            {
                float a = s / (float)sides * Mathf.PI * 2f;
                int i = r * sides + s;
                verts[i] = new Vector3(Mathf.Cos(a) * rad, y, Mathf.Sin(a) * rad);
                uv[i] = new Vector2(s / (float)sides, t);
            }
        }
        var tris = new int[rings * sides * 6];
        int n = 0;
        for (int r = 0; r < rings; r++)
        for (int s = 0; s < sides; s++)
        {
            int a = r * sides + s;
            int b = r * sides + (s + 1) % sides;
            int c = (r + 1) * sides + s;
            int d = (r + 1) * sides + (s + 1) % sides;
            tris[n++] = a; tris[n++] = c; tris[n++] = b;
            tris[n++] = b; tris[n++] = c; tris[n++] = d;
        }
        var mesh = new Mesh();
        mesh.vertices = verts;
        mesh.uv = uv;
        mesh.triangles = tris;
        mesh.RecalculateNormals();
        return mesh;
    }

    static Material canopy;
    static Material Canopy()
    {
        if (canopy != null) return canopy;
        canopy = GreyboxWorld.Mat(Color.white, 0.04f);
        return canopy;
    }

    static Material leaves;
    static Material Leaves()
    {
        if (leaves != null) return leaves;
        leaves = GreyboxWorld.Mat(Color.white, 0.05f);
        var tex = LeafTex();
        leaves.SetTexture("_BaseMap", tex);
        leaves.mainTexture = tex;
        leaves.SetFloat("_Cull", 0f);
        leaves.SetFloat("_AlphaClip", 1f);
        leaves.SetFloat("_Cutoff", 0.22f);
        leaves.EnableKeyword("_ALPHATEST_ON");
        leaves.renderQueue = (int)RenderQueue.AlphaTest;
        leaves.SetFloat("_Smoothness", 0.05f);
        return leaves;
    }

    static Texture2D LeafTex()
    {
        const int n = 96;
        var t = new Texture2D(n, n, TextureFormat.RGBA32, true);
        var px = new Color[n * n];
        var r = new System.Random(5);
        for (int i = 0; i < 16; i++)
        {
            float cx = 12 + (float)r.NextDouble() * 72;
            float cy = 10 + (float)r.NextDouble() * 76;
            float rx = 8 + (float)r.NextDouble() * 14;
            float ry = 5 + (float)r.NextDouble() * 12;
            float ang = (float)r.NextDouble() * 3.1f;
            float g = 0.32f + (float)r.NextDouble() * 0.3f;
            var col = new Color(0.12f + (float)r.NextDouble() * 0.12f, g, 0.07f, 1f);
            float ca = Mathf.Cos(ang), sa = Mathf.Sin(ang);
            for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float dx = x - cx, dy = y - cy;
                float lx = (dx * ca + dy * sa) / rx;
                float ly = (-dx * sa + dy * ca) / ry;
                float dist = lx * lx + ly * ly;
                if (dist >= 1f) continue;
                float a = (1f - dist) * (1f - dist);
                int id = y * n + x;
                if (a > px[id].a) px[id] = new Color(col.r, col.g, col.b, a);
            }
        }
        t.SetPixels(px);
        t.Apply(true, true);
        t.wrapMode = TextureWrapMode.Clamp;
        return t;
    }

    public static void Lamp(Vector3 pos, float yaw)
    {
        var scanned = PropKit.Spawn("Poly/street_lamp_01/street_lamp_01_1k", pos, Quaternion.Euler(0f, yaw, 0f), 3.87f, false);
        if (scanned != null) return;
        var root = new GameObject("Lamp").transform;
        root.position = pos;
        root.rotation = Quaternion.Euler(0f, yaw, 0f);
        var iron = GreyboxWorld.Mat(new Color(0.16f, 0.17f, 0.18f), 0.45f);
        Box(root, "Pole", new Vector3(0f, 2.7f, 0f), new Vector3(0.1f, 5.4f, 0.1f), iron);
        Box(root, "Arm", new Vector3(0f, 5.25f, 0.4f), new Vector3(0.08f, 0.08f, 0.9f), iron);
        var head = Box(root, "Head", new Vector3(0f, 5.12f, 0.85f), new Vector3(0.28f, 0.1f, 0.46f), iron);
        var glow = GreyboxWorld.Mat(new Color(1f, 0.9f, 0.7f), 0.4f);
        glow.EnableKeyword("_EMISSION");
        glow.SetColor("_EmissionColor", new Color(1f, 0.82f, 0.5f) * 2.4f);
        var bulb = Box(root, "Bulb", new Vector3(0f, 5.05f, 0.85f), new Vector3(0.16f, 0.05f, 0.28f), glow);
        bulb.GetComponent<Collider>().enabled = false;
        head.GetComponent<Collider>().enabled = false;
    }

    public static void Rock(Vector3 pos, float scale, float yaw)
    {
        var rock = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        rock.name = "Rock";
        rock.transform.position = pos + Vector3.up * (0.18f * scale);
        rock.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
        rock.transform.localScale = new Vector3(1.1f, 0.55f, 0.85f) * scale;
        var mat = GreyboxWorld.Photo("Ground037", new Vector2(1.2f, 1.2f), new Color(0.55f, 0.52f, 0.48f))
            ?? GreyboxWorld.Mat(new Color(0.35f, 0.34f, 0.32f), 0.08f);
        rock.GetComponent<Renderer>().sharedMaterial = mat;
    }

    static Material glassMat;
    static Material Glass()
    {
        if (glassMat != null) return glassMat;
        glassMat = GreyboxWorld.Mat(new Color(0.42f, 0.52f, 0.56f), 0.55f);
        return glassMat;
    }

    static GameObject Box(Transform parent, string name, Vector3 localPos, Vector3 localScale, Material mat)
    {
        var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
        g.name = name;
        g.transform.SetParent(parent, false);
        g.transform.localPosition = localPos;
        g.transform.localRotation = Quaternion.identity;
        g.transform.localScale = localScale;
        var rend = g.GetComponent<Renderer>();
        var tiled = new Material(mat);
        float tile = 1.4f;
        Vector2 st;
        if (localScale.y <= localScale.x && localScale.y <= localScale.z)
            st = new Vector2(localScale.x / tile, localScale.z / tile);
        else if (localScale.x <= localScale.y && localScale.x <= localScale.z)
            st = new Vector2(localScale.z / tile, localScale.y / tile);
        else
            st = new Vector2(localScale.x / tile, localScale.y / tile);
        st.x = Mathf.Max(0.2f, st.x);
        st.y = Mathf.Max(0.2f, st.y);
        tiled.mainTextureScale = st;
        if (tiled.HasProperty("_BaseMap")) tiled.SetTextureScale("_BaseMap", st);
        rend.sharedMaterial = tiled;
        if (name == "Yard" || name == "Path" || name == "Glass" || name == "Board" || name == "Frame" || name == "Mullion" || name == "Fascia" || name == "Ridge" || name == "Awning")
        {
            var col = g.GetComponent<Collider>();
            if (col != null) PropKit.Release(col);
        }
        return g;
    }

    static void Place(string path, Transform parent, Vector3 local, float height)
    {
        var go = PropKit.Spawn(path, parent.TransformPoint(local), parent.rotation, height, true);
        if (go != null) go.transform.SetParent(parent, true);
    }
}
