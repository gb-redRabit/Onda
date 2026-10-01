#!/usr/bin/env node
// Pilnuje niezmiennika wersji/release, dzięki czemu ręcznie edytowana wersja nigdy
// nie może po cichu różnić się od release-please.
//
// Awaria, której to zapobiega: ktoś uruchamia `npm version 0.4.4` i commituje to,
// podczas gdy release-please niezależnie wyliczył 0.5.0 na podstawie Conventional
// Commits. Repo twierdzi wtedy, że ma jedną wersję, a release PR i
// opublikowany tag twierdzą, że inną — i nic nie zawodzi, dopóki użytkownik nie zainstaluje
// "złej" kompilacji.
//
// release-please jest właścicielem wersji. Niezmiennik, jako właściwość drzewa:
//
//   wersja package.json === wersja .release-please-manifest.json
//   ORAZ ta wersja jest albo
//     (a) najnowszym tagiem v*                    — brak oczekującego release
//     (b) przed nim, zapisana przez release commit — release PR scalony,
//                                                    tag jeszcze nie wypchnięty
//
// Każdy inny stan oznacza, że człowiek ręcznie edytował wersję.

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
    // (a) czysto: drzewo to dokładnie ostatni opublikowany release.
  } else {
    // (b) albo naruszenie. Tylko commit release-please może nieść wersję
    //     nowszą niż najnowszy tag.
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
