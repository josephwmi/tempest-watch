// Keeps the README's version lines honest.
//
//   node scripts/release-notes.cjs          check the README against app.json
//   node scripts/release-notes.cjs --write  fix the version lines in place
//
// The README should never claim a version that app.json does not have, and its
// release links should never point at a tag that has not been published. This
// script is the single place that decides both, so the two cannot drift apart.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const version = appJson.app.version.name
const tag = 'v' + version
const readmePath = path.join(ROOT, 'README.md')

const wanted = [
  { test: /version-\d+\.\d+\.\d+-/, want: `version-${version}-` },
  { test: /release-v\d+\.\d+\.\d+-/, want: `release-${tag}-` },
  { test: /Current version: \*\*\d+\.\d+\.\d+\*\*/, want: `Current version: **${version}**` }
]

const releaseLink = `https://github.com/josephwmi/tempest-watch/releases/tag/${tag}`
const assetLink = `https://github.com/josephwmi/tempest-watch/releases/download/${tag}/tempest-watch-balance2.zab`

let readme = fs.readFileSync(readmePath, 'utf8')
const problems = []

for (const rule of wanted) {
  const match = readme.match(rule.test)
  if (!match) problems.push(`missing: ${rule.want}`)
  else if (match[0] !== rule.want) problems.push(`stale: ${match[0]} should be ${rule.want}`)
}

const versionRefs = readme.match(/releases\/(tag|download)\/v\d+\.\d+\.\d+/g) || []
for (const ref of versionRefs) {
  if (ref.indexOf('/' + tag) === -1) problems.push(`release link points at ${ref}, not ${tag}`)
}

if (process.argv.includes('--write')) {
  readme = readme.replace(/version-\d+\.\d+\.\d+-/g, `version-${version}-`)
  readme = readme.replace(/release-v\d+\.\d+\.\d+-/g, `release-${tag}-`)
  readme = readme.replace(/Current version: \*\*\d+\.\d+\.\d+\*\*/g, `Current version: **${version}**`)
  readme = readme.replace(/releases\/tag\/v\d+\.\d+\.\d+/g, `releases/tag/${tag}`)
  readme = readme.replace(/releases\/download\/v\d+\.\d+\.\d+/g, `releases/download/${tag}`)
  fs.writeFileSync(readmePath, readme)
  console.log(`README version lines set to ${version}`)
}

if (problems.length) {
  console.error('README is out of step with app.json (' + version + '):')
  problems.forEach((p) => console.error('  - ' + p))
  console.error('Run: node scripts/release-notes.cjs --write')
  process.exit(1)
}

console.log(`README matches app.json: ${version}`)
console.log(`  release: ${releaseLink}`)
console.log(`  package: ${assetLink}`)
