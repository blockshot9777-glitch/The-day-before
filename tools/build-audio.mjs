// Rebuilds assets/audio/*.mp3 from the original CC0 recordings.
//
// Usage: FFMPEG=/path/to/ffmpeg node tools/build-audio.mjs <sources-dir>
// <sources-dir> must contain clones of:
//   ffl/                    https://github.com/buddingmonkey/FreeFirearmsSFXLibrary
//   open-game-sfx-index/    https://github.com/Mcamento8/open-game-sfx-index
// Each clip is cut from the n-th non-silent segment of its source, trimmed,
// faded out, peak-normalised and encoded as mono MP3.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
if (!src) {
  console.error('usage: node tools/build-audio.mjs <sources-dir>');
  process.exit(1);
}
const out = path.join(root, 'assets/audio');
fs.mkdirSync(out, { recursive: true });

const FF = 'ffl/Prepared SFX';
const FM = 'ffl/Master Tracks';
const OGA = 'open-game-sfx-index/audio';

// name: [source, segment index, duration s, peak dB, extra ffmpeg filter]
const CLIPS = {
  // pistol (Bersa .380 standing in for the PM)
  pistol_shot_1: [`${FF}/Bersa/F_47P.wav`, 0, 0.9, -0.5],
  pistol_shot_2: [`${FF}/Bersa/F_47P.wav`, 1, 0.9, -0.5],
  pistol_shot_far: [`${FF}/Bersa/F_41P.wav`, 0, 1.2, -3],
  pistol_mag_out: [`${FM}/Bersa/F_3.wav`, 0, 0.35, -6],
  pistol_mag_in: [`${FM}/Bersa/F_4.wav`, 0, 0.35, -4],
  pistol_slide: [`${FM}/Bersa/F_11.wav`, 0, 0.3, -4],
  pistol_dry: [`${FM}/Bersa/F_23.wav`, 0, 0.2, -8],
  // pump shotgun (Benelli Nova standing in for the IZh-81)
  shotgun_shot_1: [`${FF}/Nova/O_21P.wav`, 0, 1.2, -0.3],
  shotgun_shot_2: [`${FF}/Nova/O_21P.wav`, 1, 1.2, -0.3],
  shotgun_shot_far: [`${FF}/Nova/O_17P.wav`, 0, 1.4, -3],
  shotgun_pump: [`${FM}/Nova/O_6.wav`, 0, 0.5, -4],
  shotgun_shell: [`${FM}/Nova/O_7.wav`, 0, 0.5, -5],
  shotgun_dry: [`${FM}/Nova/O_8.wav`, 0, 0.2, -8],
  // assault rifle (AK-47 standing in for the AKS-74U)
  rifle_shot_1: [`${FF}/AK-47/C_28P.wav`, 0, 0.75, -0.5],
  rifle_shot_2: [`${FF}/AK-47/C_28P.wav`, 1, 0.75, -0.5],
  rifle_shot_3: [`${FF}/AK-47/C_28P.wav`, 2, 0.75, -0.5],
  rifle_shot_far: [`${FF}/AK-47/C_31P.wav`, 0, 1.0, -3],
  rifle_mag_out: [`${FM}/AK-47/C_11.wav`, 0, 0.45, -5],
  rifle_mag_in: [`${FM}/AK-47/C_10.wav`, 0, 0.35, -4],
  rifle_bolt: [`${FM}/AK-47/C_14.wav`, 0, 1.0, -4],
  rifle_dry: [`${FM}/AK-47/C_7.wav`, 0, 0.2, -8],
  // zombies: long = groan, short and loud = attack snarl
  zombie_groan_1: [`${OGA}/oga-zombies/zombies/zombie-16.wav`, 0, 1.5, -3],
  zombie_groan_2: [`${OGA}/oga-zombies/zombies/zombie-17.wav`, 0, 1.6, -3],
  zombie_groan_3: [`${OGA}/oga-zombies/zombies/zombie-18.wav`, 0, 1.2, -3],
  zombie_groan_4: [`${OGA}/oga-zombies/zombies/zombie-21.wav`, 0, 1.1, -3],
  zombie_groan_5: [`${OGA}/oga-zombies/zombies/zombie-1.wav`, 0, 0.9, -3],
  zombie_groan_6: [`${OGA}/oga-zombies/zombies/zombie-15.wav`, 0, 0.9, -3],
  zombie_attack_1: [`${OGA}/oga-zombies/zombies/zombie-4.wav`, 0, 0.75, -2],
  zombie_attack_2: [`${OGA}/oga-zombies/zombies/zombie-10.wav`, 0, 0.7, -2],
  zombie_attack_3: [`${OGA}/oga-zombies/zombies/zombie-7.wav`, 0, 0.6, -2],
  zombie_attack_4: [`${OGA}/oga-zombies/zombies/zombie-6.wav`, 0, 0.55, -2],
  zombie_alert_1: [`${OGA}/oga-zombies/zombies/zombie-12.wav`, 0, 0.8, -2],
  zombie_alert_2: [`${OGA}/oga-zombies/zombies/zombie-14.wav`, 0, 0.7, -2],
  zombie_alert_3: [`${OGA}/oga-zombies/zombies/zombie-2.wav`, 0, 0.72, -2],
  zombie_death_1: [`${OGA}/oga-zombies/zombies/zombie-20.wav`, 0, 1.0, -3],
  zombie_death_2: [`${OGA}/oga-zombies/zombies/zombie-19.wav`, 0, 1.0, -3],
  zombie_death_3: [`${OGA}/oga-zombies/zombies/zombie-8.wav`, 0, 0.85, -3],
  // footsteps by surface
  step_grass_1: [`${OGA}/impact-sounds/footstep_grass_000.ogg`, 0, 0.4, -6],
  step_grass_2: [`${OGA}/impact-sounds/footstep_grass_001.ogg`, 0, 0.4, -6],
  step_grass_3: [`${OGA}/impact-sounds/footstep_grass_002.ogg`, 0, 0.4, -6],
  step_grass_4: [`${OGA}/impact-sounds/footstep_grass_003.ogg`, 0, 0.4, -6],
  step_hard_1: [`${OGA}/impact-sounds/footstep_concrete_000.ogg`, 0, 0.4, -6],
  step_hard_2: [`${OGA}/impact-sounds/footstep_concrete_001.ogg`, 0, 0.4, -6],
  step_hard_3: [`${OGA}/impact-sounds/footstep_concrete_002.ogg`, 0, 0.4, -6],
  step_hard_4: [`${OGA}/impact-sounds/footstep_concrete_003.ogg`, 0, 0.4, -6],
  step_wood_1: [`${OGA}/impact-sounds/footstep_wood_000.ogg`, 0, 0.4, -6],
  step_wood_2: [`${OGA}/impact-sounds/footstep_wood_001.ogg`, 0, 0.4, -6],
  step_wood_3: [`${OGA}/impact-sounds/footstep_wood_002.ogg`, 0, 0.4, -6],
  step_wood_4: [`${OGA}/impact-sounds/footstep_wood_003.ogg`, 0, 0.4, -6],
  step_gravel_1: [`${OGA}/oga-footsteps/gravel.ogg`, 0, 0.35, -6],
  step_gravel_2: [`${OGA}/oga-footsteps/stone01.ogg`, 0, 0.3, -6],
  step_leaves_1: [`${OGA}/oga-footsteps/leaves01.ogg`, 0, 0.4, -6],
  step_leaves_2: [`${OGA}/oga-footsteps/leaves02.ogg`, 0, 0.45, -6],
  step_mud_1: [`${OGA}/oga-footsteps/mud02.ogg`, 0, 0.3, -6],
  // bullet & melee impacts
  hit_flesh_1: [`${OGA}/impact-sounds/impactPunch_heavy_000.ogg`, 0, 0.35, -3],
  hit_flesh_2: [`${OGA}/impact-sounds/impactPunch_heavy_001.ogg`, 0, 0.35, -3],
  hit_flesh_3: [`${OGA}/impact-sounds/impactPunch_medium_002.ogg`, 0, 0.35, -3],
  hit_flesh_4: [`${OGA}/impact-sounds/impactPunch_medium_003.ogg`, 0, 0.35, -3],
  hit_wall_1: [`${OGA}/impact-sounds/impactGeneric_light_000.ogg`, 0, 0.3, -8],
  hit_wall_2: [`${OGA}/impact-sounds/impactGeneric_light_002.ogg`, 0, 0.3, -8],
  hit_metal_1: [`${OGA}/impact-sounds/impactMetal_light_001.ogg`, 0, 0.35, -8],
  hit_metal_2: [`${OGA}/impact-sounds/impactMetal_light_003.ogg`, 0, 0.35, -8],
  hit_wood_1: [`${OGA}/impact-sounds/impactPlank_medium_000.ogg`, 0, 0.35, -8],
  hit_wood_2: [`${OGA}/impact-sounds/impactPlank_medium_002.ogg`, 0, 0.35, -8],
  knife_hit_1: [`${OGA}/oga-hits-punches/hits/hit09.mp3.flac`, 0, 0.35, -3],
  knife_hit_2: [`${OGA}/oga-hits-punches/hits/hit25.mp3.flac`, 0, 0.35, -3],
  player_hurt_1: [`${OGA}/oga-hits-punches/hits/hit35.mp3.flac`, 0, 0.4, -3],
  player_hurt_2: [`${OGA}/oga-hits-punches/hits/hit37.mp3.flac`, 0, 0.4, -3],
};

function spawn(args) {
  // ffmpeg writes its analysis to stderr
  return spawnSync(FFMPEG, ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8' }).stderr;
}

// Start times of non-silent segments.
// Gunshot recordings have long reverb tails, so they need a stricter threshold
// to tell a new shot from the echo of the previous one.
function onsets(file) {
  const strict = file.includes('Prepared SFX');
  const filter = strict ? 'silencedetect=noise=-24dB:d=0.35' : 'silencedetect=noise=-38dB:d=0.1';
  const log = spawn(['-i', file, '-af', filter, '-f', 'null', '-']);
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const on = [];
  if (starts.length === 0 || starts[0] > 0.02) on.push(0);
  for (const e of ends) on.push(e);
  return on;
}

let total = 0;
for (const [name, [rel, seg, dur, peak]] of Object.entries(CLIPS)) {
  const file = path.join(src, rel);
  if (!fs.existsSync(file)) throw new Error(`missing source ${file}`);
  const on = onsets(file);
  if (seg >= on.length) throw new Error(`${name}: segment ${seg} not found (${on.length} segments)`);
  // coarse segment start, then cut the remaining lead-in exactly at the first
  // sample within 30 dB of the file's peak (no delay between click and sound)
  const start = Math.max(0, on[seg] - 0.05);
  const fileMax = +(/max_volume: ([-\d.]+) dB/.exec(spawn(['-i', file, '-af', 'volumedetect', '-f', 'null', '-'])) || [0, 0])[1];
  const thr = (fileMax - 30).toFixed(1);
  const fade = dur * 0.35;
  const tmp = path.join(out, `${name}.tmp.wav`);
  spawn(['-y', '-ss', String(start), '-i', file, '-ac', '1', '-ar', '44100',
    '-af', `silenceremove=start_periods=1:start_threshold=${thr}dB:start_silence=0.004,atrim=0:${dur},afade=t=in:d=0.003,afade=t=out:st=${(dur - fade).toFixed(3)}:d=${fade.toFixed(3)}`, tmp]);
  const max = +(/max_volume: ([-\d.]+) dB/.exec(spawn(['-i', tmp, '-af', 'volumedetect', '-f', 'null', '-'])) || [0, 0])[1];
  const gain = (peak - max).toFixed(2);
  // a gunshot needing a big boost means we cut an echo tail instead of a shot
  if (name.includes('shot') && peak - max > 12) throw new Error(`${name}: gain ${gain} dB, segment ${seg} is not a shot`);
  const dst = path.join(out, `${name}.mp3`);
  spawn(['-y', '-i', tmp, '-af', `volume=${gain}dB`, '-c:a', 'libmp3lame', '-b:a', name.includes('shot') ? '128k' : '96k', dst]);
  fs.unlinkSync(tmp);
  const size = fs.statSync(dst).size;
  total += size;
  console.log(`${name.padEnd(18)} seg=${seg} start=${start.toFixed(3)}s gain=${gain}dB ${(size / 1024).toFixed(1)}KB`);
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(Object.keys(CLIPS)) + '\n');
console.log(`\n${Object.keys(CLIPS).length} clips, ${(total / 1024).toFixed(0)} KB`);
