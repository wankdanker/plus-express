/**
 * Keeps CHANGELOG.md in step with `npm version`.
 *
 *   node scripts/changelog.mjs check    (preversion) fail if [Unreleased] has no entries
 *   node scripts/changelog.mjs release  (version)    move [Unreleased] entries under the new version
 */
import { readFileSync, writeFileSync } from 'node:fs';

const CHANGELOG = 'CHANGELOG.md';
const UNRELEASED_HEADING = '## [Unreleased]';

const changelog = readFileSync(CHANGELOG, 'utf8');

const start = changelog.indexOf(UNRELEASED_HEADING);
if (start === -1) {
  fail(`${CHANGELOG} has no "${UNRELEASED_HEADING}" section.`);
}
const bodyStart = start + UNRELEASED_HEADING.length;
const nextHeading = changelog.indexOf('\n## [', bodyStart);
const bodyEnd = nextHeading === -1 ? changelog.length : nextHeading;
const unreleased = changelog.slice(bodyStart, bodyEnd).trim();

const mode = process.argv[2];

if (mode === 'check') {
  if (!unreleased) {
    fail(`${CHANGELOG} has no entries under "${UNRELEASED_HEADING}". Add them before releasing.`);
  }
} else if (mode === 'release') {
  // npm has already bumped package.json when the version script runs
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  const unreleasedLink = changelog.match(/^\[Unreleased\]: (.+)\/compare\/v(.+)\.\.\.HEAD$/m);
  if (!unreleasedLink) {
    fail(`${CHANGELOG} has no "[Unreleased]: .../compare/vX.Y.Z...HEAD" link.`);
  }
  const [linkLine, repoUrl, previous] = unreleasedLink;

  let updated =
    changelog.slice(0, bodyStart) +
    `\n\n## [${version}] - ${date}\n\n${unreleased}\n` +
    changelog.slice(bodyEnd);

  updated = updated.replace(
    linkLine,
    `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD\n` +
    `[${version}]: ${repoUrl}/compare/v${previous}...v${version}`,
  );

  writeFileSync(CHANGELOG, updated);
} else {
  fail('Usage: node scripts/changelog.mjs <check|release>');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
