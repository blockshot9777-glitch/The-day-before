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

## Nature and vehicles

| Files | Source | Author | License |
|---|---|---|---|
| `nature/*.glb` (trees, bush, rocks, grass) | Nature Kit 2.1, https://kenney.nl/assets/nature-kit | Kenney | CC0 1.0, see `nature/KENNEY_LICENSE.txt` |
| `vehicles/sedan.glb` | Car, https://poly.pizza/m/unqqkULtRU | Quaternius | CC0 1.0 |

Same source repository as above (assets/models/source/nature and /vehicles).
Colours are muted and the car is rusted at runtime in `js/nature.js`.
