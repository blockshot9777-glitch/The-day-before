using UnityEditor;

// Poly Haven normal jpgs must import as normal maps or the plaster and tiles stay flat.
[InitializeOnLoad]
static class MarkNormalMaps
{
    static MarkNormalMaps()
    {
        foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { "Assets/Resources/Textures" }))
        {
            string path = AssetDatabase.GUIDToAssetPath(guid);
            if (path == null || !path.EndsWith("_nor.jpg")) continue;
            var imp = AssetImporter.GetAtPath(path) as TextureImporter;
            if (imp == null || imp.textureType == TextureImporterType.NormalMap) continue;
            imp.textureType = TextureImporterType.NormalMap;
            imp.SaveAndReimport();
        }
    }
}
