using UnityEngine;
using UnityEngine.InputSystem;

// First-person body. The camera sits on a child so pitch does not tilt the collider.
[RequireComponent(typeof(CharacterController))]
public class PlayerMotor : MonoBehaviour
{
    public float walkSpeed = 4.1f;
    public float sprintSpeed = 6.8f;
    public float crouchSpeed = 2.1f;
    public float lookSens = 0.09f;
    public bool frozen;
    public bool menuLock;

    public void SnapPitch(float degrees)
    {
        pitch = Mathf.Clamp(degrees, -85f, 85f);
        if (view != null) view.localRotation = Quaternion.Euler(pitch, 0f, 0f);
    }

    CharacterController body;
    public Transform view;
    public Light flashlight;
    float pitch;
    float yVel;
    public bool sprinting;
    public bool crouching;
    public bool lightOn = true;
    float bob;
    float stepNoise;

    public Vitals vitals;

    public void SnapLook(float pitchDeg)
    {
        pitch = Mathf.Clamp(pitchDeg, -85f, 85f);
        if (view != null) view.localRotation = Quaternion.Euler(pitch, 0f, 0f);
    }

    void Awake()
    {
        body = GetComponent<CharacterController>();
    }

    void Update()
    {
        var kb = Keyboard.current;
        var mouse = Mouse.current;
        if (kb == null || mouse == null) return;

        bool dead = vitals != null && vitals.dead;
        if (kb.fKey.wasPressedThisFrame && !menuLock) lightOn = !lightOn;
        if (flashlight != null) flashlight.enabled = lightOn && !menuLock && !dead;

        // Look still works in a car. Menus stop time, so they never reach this.
        if (!menuLock && !dead)
        {
            float mx = mouse.delta.x.ReadValue() * lookSens;
            float my = mouse.delta.y.ReadValue() * lookSens;
            transform.Rotate(0f, mx, 0f);
            pitch = Mathf.Clamp(pitch - my, -85f, 85f);
            if (view != null) view.localRotation = Quaternion.Euler(pitch, 0f, 0f);
        }

        if (frozen || menuLock || dead)
        {
            sprinting = false;
            if (vitals != null) vitals.Sprinting = false;
            return;
        }

        bool nextCrouch = kb.leftCtrlKey.isPressed || kb.cKey.isPressed;
        if (nextCrouch != crouching)
        {
            crouching = nextCrouch;
            body.height = crouching ? 1.2f : 1.8f;
            body.center = new Vector3(0f, body.height * 0.5f, 0f);
        }

        bool wantSprint = kb.leftShiftKey.isPressed && !crouching && vitals != null && vitals.stamina > 1f;
        float speed = crouching ? crouchSpeed : wantSprint ? sprintSpeed : walkSpeed;
        Vector3 wish = Vector3.zero;
        if (kb.wKey.isPressed) wish += transform.forward;
        if (kb.sKey.isPressed) wish -= transform.forward;
        if (kb.dKey.isPressed) wish += transform.right;
        if (kb.aKey.isPressed) wish -= transform.right;
        if (wish.sqrMagnitude > 1f) wish.Normalize();
        sprinting = wantSprint && wish.sqrMagnitude > 0.1f;
        if (vitals != null) vitals.Sprinting = sprinting;
        if (sprinting && Time.time - stepNoise > 0.35f)
        {
            stepNoise = Time.time;
            PlayerWeapons.LastNoise = transform.position;
            PlayerWeapons.LastNoiseTime = Time.time;
            PlayerWeapons.LastNoiseRange = 11f;
        }

        if (body.isGrounded && yVel < 0f) yVel = -2f;
        if (body.isGrounded && kb.spaceKey.wasPressedThisFrame) yVel = 6.2f;
        yVel -= 20f * Time.deltaTime;

        Vector3 move = wish * speed;
        move.y = yVel;
        body.Move(move * Time.deltaTime);

        if (view != null)
        {
            float eye = body.height - 0.12f;
            float bobY = 0f;
            if (wish.sqrMagnitude > 0.1f && body.isGrounded)
            {
                bob += Time.deltaTime * speed * 1.4f;
                bobY = Mathf.Sin(bob) * 0.018f;
            }
            view.localPosition = new Vector3(0f, eye + bobY, 0f);
        }
    }
}
