using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering.Universal;

// Empty scene is enough: Play builds the village, the player and the HUD.
public class GameBootstrap : MonoBehaviour
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Auto()
    {
        if (FindAnyObjectByType<GameBootstrap>() != null) return;
        new GameObject("Game").AddComponent<GameBootstrap>();
    }

    void Awake()
    {
        var templateCam = GameObject.Find("Main Camera");
        if (templateCam != null) templateCam.SetActive(false);
        foreach (var light in FindObjectsByType<Light>())
            if (light.type == LightType.Directional) light.gameObject.SetActive(false);

        var player = new GameObject("Player");
        player.transform.position = new Vector3(1.6f, 0.1f, -13f);
        player.transform.rotation = Quaternion.Euler(0f, -46f, 0f);
        var cc = player.AddComponent<CharacterController>();
        cc.height = 1.8f;
        cc.radius = 0.35f;
        cc.center = new Vector3(0f, 0.9f, 0f);
        cc.stepOffset = 0.4f;

        var camGo = new GameObject("Camera");
        camGo.transform.SetParent(player.transform, false);
        camGo.transform.localPosition = new Vector3(0f, 1.68f, 0f);
        camGo.tag = "MainCamera";
        var cam = camGo.AddComponent<Camera>();
        cam.nearClipPlane = 0.06f;
        cam.farClipPlane = 320f;
        cam.clearFlags = CameraClearFlags.Skybox;
        cam.backgroundColor = new Color(0.72f, 0.8f, 0.86f);
        camGo.AddComponent<AudioListener>();
        camGo.AddComponent<UniversalAdditionalCameraData>();

        var flash = camGo.AddComponent<Light>();
        flash.type = LightType.Spot;
        flash.range = 28f;
        flash.spotAngle = 48f;
        flash.intensity = 2.2f;
        flash.color = new Color(1f, 0.95f, 0.82f);
        flash.enabled = true;

        var vitals = player.AddComponent<Vitals>();
        var inv = player.AddComponent<Inventory>();
        var motor = player.AddComponent<PlayerMotor>();
        motor.view = camGo.transform;
        motor.flashlight = flash;
        motor.vitals = vitals;
        motor.lightOn = false;
        flash.enabled = false;
        motor.SnapPitch(7f);

        var guns = player.AddComponent<PlayerWeapons>();
        guns.eyes = cam;
        guns.inventory = inv;
        guns.vitals = vitals;
        guns.motor = motor;
        guns.viewModel = MakeViewModel(camGo.transform);

        var look = player.AddComponent<Interactor>();
        look.eyes = cam;
        look.inventory = inv;
        look.vitals = vitals;

        var world = new GameObject("World").AddComponent<GreyboxWorld>();
        world.Build(player.transform);

        var hudGo = new GameObject("HUD");
        var hud = hudGo.AddComponent<SurvivalHud>();
        hud.vitals = vitals;
        hud.inventory = inv;
        hud.interactor = look;
        hud.weapons = guns;
        hud.motor = motor;

        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }

    static Transform MakeViewModel(Transform cam)
    {
        var root = new GameObject("ViewModel").transform;
        root.SetParent(cam, false);
        root.localPosition = Vector3.zero;

        // Quaternius knife mesh: tip along +Y. Map +Y -> camera +Z, then a slight held cant.
        var knife = PropKit.SpawnView("Models/weapons/knife", root, new Vector3(0.28f, -0.24f, 0.55f), Vector3.zero, 0.34f, "Knife");
        if (knife != null)
        {
            knife.transform.localRotation = Quaternion.Euler(90f, -8f, -18f);
        }
        else
        {
            knife = GameObject.CreatePrimitive(PrimitiveType.Cube);
            knife.name = "Knife";
            Object.Destroy(knife.GetComponent<Collider>());
            knife.transform.SetParent(root, false);
            knife.transform.localPosition = new Vector3(0.22f, -0.2f, 0.5f);
            knife.transform.localRotation = Quaternion.identity;
            knife.transform.localScale = new Vector3(0.03f, 0.045f, 0.32f);
            knife.GetComponent<Renderer>().sharedMaterial = GreyboxWorld.Mat(new Color(0.55f, 0.55f, 0.58f), 0.35f);
        }

        var pistol = PropKit.SpawnView("Models/weapons/pistol", root, new Vector3(0.22f, -0.18f, 0.45f), new Vector3(5f, 90f, 0f), 0.22f, "Pistol");
        if (pistol == null)
        {
            pistol = new GameObject("Pistol");
            pistol.transform.SetParent(root, false);
            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(body.GetComponent<Collider>());
            body.transform.SetParent(pistol.transform, false);
            body.transform.localPosition = new Vector3(0f, 0f, 0.08f);
            body.transform.localScale = new Vector3(0.05f, 0.09f, 0.2f);
            body.GetComponent<Renderer>().sharedMaterial = GreyboxWorld.Mat(new Color(0.12f, 0.12f, 0.13f), 0.35f);
        }
        pistol.SetActive(false);
        return root;
    }
}
