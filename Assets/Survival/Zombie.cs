using UnityEngine;

// A handful of slow infected. They see, they hear gunshots, they do not fill the street.
[RequireComponent(typeof(CharacterController))]
public class Zombie : MonoBehaviour
{
    public float hp = 45f;
    public Transform target;
    CharacterController body;
    ClipPose pose;
    float yVel;
    float attackCd;
    float yaw;

    void Awake()
    {
        body = GetComponent<CharacterController>();
        pose = GetComponentInChildren<ClipPose>();
    }

    public void Hurt(float dmg)
    {
        hp -= dmg;
        if (hp <= 0f) Die();
    }

    void Die()
    {
        if (Random.value < 0.35f)
            WorldPickup.Spawn(Random.value < 0.5f ? "bandage" : "can", 1, transform.position);
        Destroy(gameObject);
    }

    void Update()
    {
        if (target == null) return;
        Vector3 to = target.position - transform.position;
        to.y = 0f;
        float dist = to.magnitude;
        float hearFor = Weather.Raining ? 1.3f : 3f;
        float hearRange = PlayerWeapons.LastNoiseRange * (Weather.Raining ? 0.35f : 1f);
        bool heard = Time.time - PlayerWeapons.LastNoiseTime < hearFor
            && Vector3.Distance(transform.position, PlayerWeapons.LastNoise) < hearRange;
        bool sees = dist < 16f && Vector3.Angle(transform.forward, to) < 70f && LineOfSight();
        bool chase = sees || heard || dist < 2.2f;

        Vector3 move = Vector3.zero;
        if (chase && dist > 1.15f)
        {
            Vector3 dir = to.normalized;
            yaw = Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
            move = dir * 1.55f;
        }
        else if (!chase)
        {
            yaw += Time.deltaTime * 12f;
        }
        transform.rotation = Quaternion.Euler(0f, yaw, 0f);
        if (pose != null) pose.Pose(chase && dist > 1.15f, Time.time);

        if (body.isGrounded && yVel < 0f) yVel = -2f;
        yVel -= 20f * Time.deltaTime;
        move.y = yVel;
        body.Move(move * Time.deltaTime);

        attackCd -= Time.deltaTime;
        if (dist < 1.45f && attackCd <= 0f)
        {
            attackCd = 1.25f;
            var v = target.GetComponent<Vitals>();
            if (v != null) v.Damage(14f, "Укус");
        }
    }

    bool LineOfSight()
    {
        Vector3 from = transform.position + Vector3.up * 1.5f;
        Vector3 to = target.position + Vector3.up * 1.4f;
        Vector3 dir = to - from;
        if (Physics.Raycast(from, dir.normalized, out RaycastHit hit, dir.magnitude, ~0, QueryTriggerInteraction.Ignore))
            return hit.collider.GetComponentInParent<PlayerMotor>() != null;
        return true;
    }
}
