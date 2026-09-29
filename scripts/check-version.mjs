#!/usr/bin/env node
// Guards the version/release invariant so a hand-edited version can never
// silently disagree with release-please.
//
// The failure this prevents: someone runs `npm version 0.4.4` and commits it,
// while release-please has independently computed 0.5.0 from the Conventional
// Commits. The repo then claims one version and the release PR and the
// published tag claim another — and nothing fails until a user installs the
// "wrong" build.
//
// release-please owns the version. The invariant, as a property of the tree:
//
//   package.json version === .release-please-manifest.json version
//   AND that version is either
//     (a) the latest v* tag                       — no release pending
//     (b) ahead of it, written by a release commit — release PR merged,
//                                                  tag not pushed yet
//
// Any other state means a human edited the version by hand.

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const readJson = (rel) => {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf-8'));
  } catch {
    return null;
  }
};

const git = (args) => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
};

const problems = [];
const version = readJson('package.json')?.version ?? null;
const manifest = readJson('.release-please-manifest.json');
const recorded = manifest ? (manifest['.'] ?? Object.values(manifest)[0]) : null;

if (!version) problems.push('package.json is missing or unreadable');
if (!manifest) {
  problems.push('.release-please-manifest.json is missing — the release-please state was lost');
} else if (recorded !== version) {
  problems.push(`package.json is ${version} but .release-please-manifest.json records ${recorded}`);
}

const tags = git(['tag', '--list', 'v*', '--sort=-v:refname']);
const latestTag = tags ? tags.split('\n').find((t) => /^v\d+\.\d+\.\d+$/.test(t)) : null;
const latestTagVersion = latestTag ? latestTag.slice(1) : null;

if (version && latestTagVersion) {
  if (version === latestTagVersion) {
    // (a) clean: the tree is exactly the last published release.
  } else {
    // (b) or a violation. Only a release-please commit may carry a version
    //     that is ahead of the newest tag.
    const subject = git(['log', '-1', '--format=%s', '--', 'package.json']);
    const isReleaseCommit =
      subject !== null && /^chore\(main\): release \d+\.\d+\.\d+/.test(subject);
    if (!isReleaseCommit) {
      problems.push(
        `package.json says ${version} but the newest tag is ${latestTag} and the last ` +
          `commit touching the version was ${subject ? `"${subject}"` : 'unknown'}. ` +
          'Only release-please may move the version — revert any hand edit and let the ' +
          'release PR set it (see RELEASE.md §2).'
      );
    }
  }
} else if (version && !latestTagVersion) {
  console.log('version:check — no v* tags yet, skipping the tag comparison');
}

if (problems.length) {
  console.error('version:check — FAILED');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `version:check — OK (${version}, newest tag ${latestTag ?? 'none'}; release-please owns the version)`
);
