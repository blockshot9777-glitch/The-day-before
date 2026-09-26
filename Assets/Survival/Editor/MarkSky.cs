using UnityEditor;

// The afternoon HDR must stay a latitude-longitude texture. A cubemap import draws a black sky.
[InitializeOnLoad]
static class MarkSky
{
    static MarkSky()
    {
        const string path = "Assets/Resources/Sky/lonely_road_afternoon_puresky_2k.hdr";
        var imp = AssetImporter.GetAtPath(path) as TextureImporter;
        if (imp == null) return;
        if (imp.textureShape == TextureImporterShape.Texture2D && imp.textureType == TextureImporterType.Default) return;
        imp.textureType = TextureImporterType.Default;
        imp.textureShape = TextureImporterShape.Texture2D;
        imp.sRGBTexture = true;
        imp.mipmapEnabled = false;
        imp.SaveAndReimport();
    }
}
