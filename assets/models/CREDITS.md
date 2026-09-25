# Model credits

| Files | Source | Author | License |
|---|---|---|---|
| `zombies/casual-man.glb` | Casual Character, https://poly.pizza/m/kZ3DmIoGip | Quaternius | CC0 1.0 |
| `zombies/hoodie-man.glb` | Hoodie Character, https://poly.pizza/m/gKLBoRsyKe | Quaternius | CC0 1.0 |
| `zombies/beach-man.glb` | Beach Character, https://poly.pizza/m/DojKLcO34E | Quaternius | CC0 1.0 |
| `zombies/casual-woman.glb` | Woman Casual, https://poly.pizza/m/jpKRgGDxhk | Quaternius | CC0 1.0 |

The source files were taken from the CC0 asset folder of
https://github.com/kurta999/MyVibeGTA (assets/models/source/characters).
`tools/build-models.mjs` keeps the seven clips the game uses (idle, walk, run,
attack, attack2, hit, death) and drops everything else. The infected colours
and the hunched posture are applied at runtime in `js/models.js`.
