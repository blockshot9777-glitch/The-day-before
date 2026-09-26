using System.Collections.Generic;
using UnityEngine;

// Loads a glTF prefab from Resources and scales it so the visible height matches metres.
public static class PropKit
{
    static readonly HashSet<string> missing = new HashSet<string>();
    public static GameObject Spawn(string resourcePath, Vector3 pos, Quaternion rot, float targetHeight, bool collider)
    {
        var prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
        {
            if (missing.Add(resourcePath)) Debug.LogWarning("Model not imported: " + resourcePath);
            return null;
        }
        var go = Object.Instantiate(prefab, pos, rot);
        go.name = prefab.name;
        if (targetHeight > 0f) FitHeight(go, targetHeight, pos.y);
        if (collider) AddBoundsCollider(go);
        else StripColliders(go);
        Calm(go);
        TryLoop(go, resourcePath);
        return go;
    }

    // First-person prop. rot is applied in the view's local space, then the longest side is fit to metres.
    public static GameObject SpawnView(string resourcePath, Transform parent, Vector3 localPos, Vector3 localEuler, float length, string name)
    {
        var prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
        {
            if (missing.Add(resourcePath)) Debug.LogWarning("Model not imported: " + resourcePath);
            return null;
        }
        var go = Object.Instantiate(prefab, parent, false);
        go.name = name;
        go.transform.localPosition = localPos;
        go.transform.localRotation = Quaternion.Euler(localEuler);
        go.transform.localScale = Vector3.one;
        var rs = go.GetComponentsInChildren<Renderer>();
        if (rs.Length > 0 && length > 0f)
        {
            var b = rs[0].bounds;
            for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
            float longest = Mathf.Max(b.size.x, Mathf.Max(b.size.y, b.size.z));
            if (longest > 0.0001f) go.transform.localScale = Vector3.one * (length / longest);
        }
        foreach (var c in go.GetComponentsInChildren<Collider>()) Object.Destroy(c);
        Calm(go);
        return go;
    }

    // glTF metals were mirroring the sky, so props read as flat cyan.
    // Copy materials explicitly. renderer.materials logs an error in edit mode and the tests treat that as a failure.
    static void Calm(GameObject go)
    {
        foreach (var r in go.GetComponentsInChildren<Renderer>())
        {
            var src = r.sharedMaterials;
            var copy = new Material[src.Length];
            for (int i = 0; i < src.Length; i++)
            {
                if (src[i] == null) continue;
                var m = new Material(src[i]);
                if (m.HasProperty("metallicFactor")) m.SetFloat("metallicFactor", 0f);
                if (m.HasProperty("roughnessFactor")) m.SetFloat("roughnessFactor", 0.72f);
                if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
                if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.28f);
                copy[i] = m;
            }
            r.sharedMaterials = copy;
        }
    }

    public static void FitHeight(GameObject go, float targetHeight, float groundY)
    {
        var rs = go.GetComponentsInChildren<Renderer>();
        if (rs.Length == 0 || targetHeight <= 0f) return;
        var b = rs[0].bounds;
        for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
        // A rug or a card has almost no height. Scaling it to metres turns it into a wall.
        bool flat = b.size.y < Mathf.Min(b.size.x, b.size.z) * 0.08f;
        float raw = b.size.y > 0.0001f ? targetHeight / b.size.y : 999f;
        if (flat && (raw > 8f || raw < 0.125f)) return;
        float h = Mathf.Max(0.01f, b.size.y);
        go.transform.localScale *= targetHeight / h;
        b = rs[0].bounds;
        for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
        go.transform.position += Vector3.up * (groundY - b.min.y);
    }

    public static void Release(Object obj)
    {
        if (obj == null) return;
        if (Application.isPlaying) Object.Destroy(obj);
        else Object.DestroyImmediate(obj);
    }

    static void StripColliders(GameObject go)
    {
        foreach (var c in go.GetComponentsInChildren<Collider>()) Release(c);
    }

    // Build the box in the object's local space so rotated props keep a centered hit volume.
    public static void AddBoundsCollider(GameObject go)
    {
        foreach (var c in go.GetComponentsInChildren<Collider>()) Release(c);
        Bounds local = default;
        bool any = false;
        var filters = go.GetComponentsInChildren<MeshFilter>();
        foreach (var mf in filters)
        {
            if (mf.sharedMesh == null) continue;
            EncapsulateLocal(ref local, ref any, go.transform, mf.transform, mf.sharedMesh.bounds);
        }
        if (!any)
        {
            foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                if (smr.sharedMesh == null) continue;
                EncapsulateLocal(ref local, ref any, go.transform, smr.transform, smr.localBounds);
            }
        }
        if (!any) return;
        var box = go.AddComponent<BoxCollider>();
        box.center = local.center;
        box.size = Vector3.Max(local.size, new Vector3(0.15f, 0.15f, 0.15f));
    }

    static void EncapsulateLocal(ref Bounds local, ref bool any, Transform root, Transform meshTr, Bounds meshBounds)
    {
        Vector3 ext = meshBounds.extents;
        for (int i = 0; i < 8; i++)
        {
            Vector3 corner = meshBounds.center + new Vector3(
                (i & 1) == 0 ? -ext.x : ext.x,
                (i & 2) == 0 ? -ext.y : ext.y,
                (i & 4) == 0 ? -ext.z : ext.z);
            Vector3 pt = root.InverseTransformPoint(meshTr.TransformPoint(corner));
            if (!any) { local = new Bounds(pt, Vector3.zero); any = true; }
            else local.Encapsulate(pt);
        }
    }

    // Point the longest mesh axis of a viewmodel down the camera's forward (+Z local).
    // Prefer the axis that points toward the mesh AABB max (blade tip), not the handle.
    public static void AimForward(GameObject go)
    {
        Vector3 bestAxis = Vector3.zero;
        float bestLen = 0f;
        foreach (var mf in go.GetComponentsInChildren<MeshFilter>())
        {
            if (mf.sharedMesh == null) continue;
            Vector3 s = Vector3.Scale(mf.sharedMesh.bounds.size, mf.transform.lossyScale);
            Vector3 localAxis;
            float len;
            if (s.x >= s.y && s.x >= s.z) { localAxis = Vector3.right; len = s.x; }
            else if (s.y >= s.z) { localAxis = Vector3.up; len = s.y; }
            else { localAxis = Vector3.forward; len = s.z; }
            // Tip is the far end of the longest AABB side from the mesh center.
            Vector3 tipWorld = mf.transform.TransformPoint(mf.sharedMesh.bounds.center + Vector3.Scale(localAxis, mf.sharedMesh.bounds.extents));
            Vector3 baseWorld = mf.transform.TransformPoint(mf.sharedMesh.bounds.center - Vector3.Scale(localAxis, mf.sharedMesh.bounds.extents));
            Vector3 tipDir = go.transform.InverseTransformDirection(tipWorld - baseWorld);
            if (len > bestLen) { bestLen = len; bestAxis = tipDir; }
        }
        if (bestLen < 0.0001f || bestAxis.sqrMagnitude < 0.0001f) return;
        go.transform.localRotation = Quaternion.FromToRotation(bestAxis.normalized, Vector3.forward) * go.transform.localRotation;
    }

    public static void TryLoop(GameObject go, string resourcePath)
    {
        var clips = Resources.LoadAll<AnimationClip>(resourcePath);
        if (clips == null || clips.Length == 0) return;
        var anim = go.GetComponent<Animation>();
        if (anim == null) anim = go.AddComponent<Animation>();
        AnimationClip play = null;
        AnimationClip walk = null;
        foreach (var src in clips)
        {
            if (src == null || src.name.StartsWith("__")) continue;
            string n = src.name.ToLower();
            if (play == null || n.Contains("idle")) play = src;
            if (n.Contains("walk") || n.Contains("run")) walk = src;
            var c = Object.Instantiate(src);
            c.legacy = true;
            c.wrapMode = WrapMode.Loop;
            anim.AddClip(c, c.name);
            if (n.Contains("idle") || n.Contains("walk")) anim.Play(c.name);
        }
        if (play != null)
        {
            var pose = go.GetComponent<ClipPose>();
            if (pose == null) pose = go.AddComponent<ClipPose>();
            pose.idle = play;
            pose.walk = walk != null ? walk : play;
            play.SampleAnimation(go, 0.05f);
        }
    }

    public static Texture2D NoiseTex(Color a, Color b, int size, float freq)
    {
        var t = new Texture2D(size, size, TextureFormat.RGB24, true);
        t.wrapMode = TextureWrapMode.Repeat;
        t.filterMode = FilterMode.Bilinear;
        var px = new Color[size * size];
        for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++)
        {
            float n = Mathf.PerlinNoise(x * freq, y * freq);
            float n2 = Mathf.PerlinNoise(x * freq * 4f + 20f, y * freq * 4f);
            px[y * size + x] = Color.Lerp(a, b, n * 0.75f + n2 * 0.25f);
        }
        t.SetPixels(px);
        t.Apply();
        return t;
    }

    public static Material TexMat(Texture2D tex, float smooth = 0.15f)
    {
        var m = GreyboxWorld.Mat(Color.white, smooth);
        m.mainTexture = tex;
        if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", tex);
        return m;
    }
}

// Samples an imported clip onto a character when there is no Animator controller.
public class ClipPose : MonoBehaviour
{
    public AnimationClip idle;
    public AnimationClip walk;

    public void Pose(bool moving, float time)
    {
        var clip = moving && walk != null ? walk : idle;
        if (clip == null || clip.length <= 0.01f) return;
        clip.SampleAnimation(gameObject, time % clip.length);
    }
}
