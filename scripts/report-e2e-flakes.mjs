import { existsSync, readFileSync } from 'node:fs';

// Czyta raport JSON Playwrighta i wypisuje testy, które przeszły dopiero po
// retry. GitHub Actions pokaże je jako ostrzeżenia w adnotacjach runu, więc
// flake jest widoczny bez dostępu do surowego logu. Skrypt nigdy nie wywala CI.
const REPORT = 'test-results/results.json';

if (!existsSync(REPORT)) {
  console.log('e2e-flakes — brak raportu JSON, pomijam');
  process.exit(0);
}

const raw = readFileSync(REPORT, 'utf8').replace(/^\uFEFF/, '');

let report;
try {
  report = JSON.parse(raw);
} catch (error) {
  console.log(`e2e-flakes — nieczytelny raport JSON (${String(error)}), pomijam`);
  process.exit(0);
}
const flakes = [];

function visitSuites(suites, titlePath) {
  for (const suite of suites ?? []) {
    const path = suite.title ? [...titlePath, suite.title] : titlePath;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const attempts = test.results?.length ?? 0;
        const failedFirst = (test.results ?? []).some((r) => r.status === 'failed');
        if (
          test.status === 'flaky' ||
          (attempts > 1 && failedFirst && test.status === 'expected')
        ) {
          flakes.push({
            title: [...path, spec.title].filter(Boolean).join(' › '),
            file: spec.file,
            line: spec.line,
            attempts
          });
        }
      }
    }
    visitSuites(suite.suites, path);
  }
}

visitSuites(report.suites, []);

if (flakes.length === 0) {
  console.log('e2e-flakes — brak flaky w tym runie');
  process.exit(0);
}

console.log(`e2e-flakes — ${flakes.length} test(ów) przeszło dopiero po retry:`);
for (const flake of flakes) {
  console.log(`  ${flake.file}:${flake.line} — ${flake.title} (prób: ${flake.attempts})`);
  const location = flake.file && flake.line ? `,file=${flake.file},line=${flake.line}` : '';
  console.log(`::warning title=Flaky E2E${location}::${flake.title} (attempts: ${flake.attempts})`);
}
