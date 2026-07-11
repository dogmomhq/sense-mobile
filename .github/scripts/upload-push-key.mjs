// One-shot: upload APNs push key to Expo and attach to iOS app credentials.
// Mirrors eas-cli's SetUpPushKey flow via api.expo.dev/graphql.
// Env: EXPO_TOKEN, P8_B64, KEY_ID, TEAM_ID
const TOKEN = process.env.EXPO_TOKEN;
const P8 = Buffer.from(process.env.P8_B64 || '', 'base64').toString('utf8');
const KEY_ID = process.env.KEY_ID;
const TEAM_ID = process.env.TEAM_ID;
const FULL_NAME = '@commonsense94/sense-mobile';
const ACCOUNT_NAME = 'commonsense94';
const BUNDLE_ID = 'com.dogmomhq.sensemobile';

if (!TOKEN || !P8 || !KEY_ID || !TEAM_ID) { console.error('missing env'); process.exit(1); }

async function gql(query, variables) {
  const r = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error('GraphQL: ' + JSON.stringify(j.errors.map(e => e.message)));
  return j.data;
}

const app = (await gql(
  `query($f:String!){ app { byFullName(fullName:$f){ id ownerAccount { id name } } } }`,
  { f: FULL_NAME }
)).app.byFullName;
console.log('app id:', app.id, '| account id:', app.ownerAccount.id);
const accountId = app.ownerAccount.id;

let team = (await gql(
  `query($a:ID!,$t:String!){ appleTeam { byAppleTeamIdentifier(accountId:$a, identifier:$t){ id } } }`,
  { a: accountId, t: TEAM_ID }
)).appleTeam.byAppleTeamIdentifier;
if (!team) {
  team = (await gql(
    `mutation($i:AppleTeamInput!,$a:ID!){ appleTeam { createAppleTeam(appleTeamInput:$i, accountId:$a){ id } } }`,
    { i: { appleTeamIdentifier: TEAM_ID }, a: accountId }
  )).appleTeam.createAppleTeam;
  console.log('created apple team:', team.id);
} else console.log('existing apple team:', team.id);

let appId = (await gql(
  `query($n:String!,$b:String!){ account { byName(accountName:$n){ id appleAppIdentifiers(bundleIdentifier:$b){ id } } } }`,
  { n: ACCOUNT_NAME, b: BUNDLE_ID }
)).account.byName.appleAppIdentifiers[0];
if (!appId) {
  appId = (await gql(
    `mutation($i:AppleAppIdentifierInput!,$a:ID!){ appleAppIdentifier { createAppleAppIdentifier(appleAppIdentifierInput:$i, accountId:$a){ id } } }`,
    { i: { bundleIdentifier: BUNDLE_ID, appleTeamId: team.id }, a: accountId }
  )).appleAppIdentifier.createAppleAppIdentifier;
  console.log('created app identifier:', appId.id);
} else console.log('existing app identifier:', appId.id);

const pushKey = (await gql(
  `mutation($i:ApplePushKeyInput!,$a:ID!){ applePushKey { createApplePushKey(applePushKeyInput:$i, accountId:$a){ id keyIdentifier } } }`,
  { i: { keyP8: P8, keyIdentifier: KEY_ID, appleTeamId: team.id }, a: accountId }
)).applePushKey.createApplePushKey;
console.log('created push key:', pushKey.id, pushKey.keyIdentifier);

let creds = (await gql(
  `query($f:String!,$aid:String!){ app { byFullName(fullName:$f){ id iosAppCredentials(filter:{appleAppIdentifierId:$aid}){ id pushKey { id keyIdentifier } } } } }`,
  { f: FULL_NAME, aid: appId.id }
)).app.byFullName.iosAppCredentials[0];
if (!creds) {
  creds = (await gql(
    `mutation($i:IosAppCredentialsInput!,$app:ID!,$aid:ID!){ iosAppCredentials { createIosAppCredentials(iosAppCredentialsInput:$i, appId:$app, appleAppIdentifierId:$aid){ id } } }`,
    { i: { appleTeamId: team.id }, app: app.id, aid: appId.id }
  )).iosAppCredentials.createIosAppCredentials;
  console.log('created ios app credentials:', creds.id);
} else console.log('existing ios app credentials:', creds.id, 'pushKey:', creds.pushKey?.keyIdentifier ?? 'none');

const set = (await gql(
  `mutation($c:ID!,$k:ID!){ iosAppCredentials { setPushKey(id:$c, pushKeyId:$k){ id pushKey { id keyIdentifier } } } }`,
  { c: creds.id, k: pushKey.id }
)).iosAppCredentials.setPushKey;
console.log('DONE — push key attached:', set.pushKey.keyIdentifier);
