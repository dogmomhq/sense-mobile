// ── Avatar catalog (B53) ────────────────────────────────────────────────────
// 5 bundled animal portraits the player picks as their profile pic (CJ:
// "give the profile image an animal pic... let them choose in the profile
// section"). Device-local only — AsyncStorage 'sense_avatar'; does NOT sync
// to the server, so opponents/leaderboard never see it and a reinstall
// resets to the default. Swap/add animals: drop a 512x512 jpg in
// assets/avatars/ and add one line to AVATARS.
// B89 (2026-08-22, CJ): crown is the DEFAULT avatar for everyone who never
// picked one; the animal picker in Profile stays.
export const AVATARS = {
  crown: require('../assets/avatars/crown.png'),
  cheetah: require('../assets/avatars/cheetah.jpg'),
  lion: require('../assets/avatars/lion.jpg'),
  tiger: require('../assets/avatars/tiger.jpg'),
  wolf: require('../assets/avatars/wolf.jpg'),
  fox: require('../assets/avatars/fox.jpg'),
};
export const AVATAR_KEYS = Object.keys(AVATARS);
export const DEFAULT_AVATAR_KEY = 'crown';
export function avatarSource(key) {
  return AVATARS[key] || AVATARS[DEFAULT_AVATAR_KEY];
}
