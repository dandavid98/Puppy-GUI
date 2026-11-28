// The one place Puppy's version is worked out (used by the build and by make-app.sh).
// It is package.json's major.minor plus the number of commits as the last digit (0.1.7, then 0.1.8, ...), so it goes up
// with every update and nobody has to remember to bump it. Edit package.json to change the major.minor part.
// Without git history (a ZIP download) it falls back to package.json's version as written; a shallow clone would count
// too few commits, which is why scripts/setup.sh unshallows first.
const { execFileSync } = require('node:child_process')
const { version } = require('../package.json')

function puppyVersion() {
  const [major, minor, patch] = version.split('.')
  try {
    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return [major, minor, count || patch].join('.')
  } catch {
    return version
  }
}

module.exports = { puppyVersion }

if (require.main === module) console.log(puppyVersion())
