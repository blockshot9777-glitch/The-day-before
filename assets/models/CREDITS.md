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

## Weapons

| Files | Source | Author | License |
|---|---|---|---|
| `weapons/pistol.glb`, `weapons/shotgun.glb` | Ultimate Guns Pack, https://quaternius.com/packs/ultimategun.html | Quaternius | CC0 1.0 |
| `weapons/ak47.glb` | "Ak47", https://sketchfab.com/3d-models/ak47-831519a097d84e079fd8bc4b15e5b57d | wburton (@wburton95) | **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/ |
| `weapons/knife.glb` | Toon Shooter Game Kit, https://quaternius.com/packs/toonshootergamekit.html | Quaternius | CC0 1.0 |

The guns were taken from https://github.com/okaiquemota/rpk.fps (assets/models:
pistol.glb, shotgun.glb, rifle.glb), which records the same sources and licenses.

**Attribution required for the AK47 (CC BY 4.0):** "Ak47" by wburton, licensed
under CC BY 4.0. Changes: used as the in-game AKS-74U, frozen in the first frame
of its idle clip, scaled and positioned in the first-person view at runtime
(`js/weapons.js`); its animations are not used. The credit is also shown in the
game's main menu.

## Props

| Files | Source | Author | License |
|---|---|---|---|
| `props/*.glb` | Toon Shooter Game Kit (Dec 2022), https://quaternius.com/packs/toonshootergamekit.html | Quaternius | CC0 1.0 |

Built from the kit's glTF files by `tools/build-props.mjs` (source copy:
https://github.com/MarcoPaoletta/xogot---toon-shooter). The toy colours are
replaced with worn, muted ones at runtime (`js/nature.js`).
