#!/usr/bin/env node
// Implements SR-9003 (V&V evidence package) per
// docs/regulatory/62304-requirements.md.
//
// Runs the full verification suite (typecheck, lint, jest, optional
// native builds) and writes a dated, content-addressed evidence
// bundle to docs/regulatory/vv-evidence/<date>-<short-sha>/. The
// bundle is what a 62304 / FDA auditor reconstructs the test state
// from after a release tag — see SR-9003 in the requirements doc.
//
// Usage:
//   node scripts/collect-vv-evidence.mjs              # JS-only suite
//   node scripts/collect-vv-evidence.mjs --android    # + Android assembleDebug
//   node scripts/collect-vv-evidence.mjs --ios        # + iOS xcodebuild
//   node scripts/collect-vv-evidence.mjs --all        # JS + Android + iOS
//
// The script does NOT abort on a step failure — every step's exit
// status is captured in manifest.json so an audit can see "lint
// passed, typecheck failed" as a single record. Process exits with
// code 1 iff any captured step failed; the bundle is still written.

import {
  createHash,
} from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'regulatory', 'vv-evidence');

// -------- Args ---------------------------------------------------------

const args = new Set(process.argv.slice(2));
const RUN_ANDROID = args.has('--android') || args.has('--all');
const RUN_IOS = args.has('--ios') || args.has('--all');

// -------- Git / environment metadata -----------------------------------

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

const headSha = git('rev-parse HEAD');
const shortSha = git('rev-parse --short HEAD');
const branch = git('rev-parse --abbrev-ref HEAD');
const commitMessage = git('log -1 --pretty=%s');
const commitDate = git('log -1 --pretty=%cI');
const describedTag = git('describe --tags --always');
const isoNow = new Date().toISOString();
const dateOnly = isoNow.slice(0, 10);
const isClean = git('status --porcelain') === '';

// Tool versions
function tryCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
  } catch {
    return null;
  }
}
const nodeVersion = process.version;
const npmVersion = tryCmd('npm --version');
const xcodeVersion = tryCmd('xcodebuild -version');
const ndkVersion = (() => {
  // Read from android/build.gradle so we report the *configured* NDK,
  // not whatever happens to be in $ANDROID_HOME.
  const gradlePath = join(REPO_ROOT, 'android', 'build.gradle');
  if (!existsSync(gradlePath)) return null;
  const content = readFileSync(gradlePath, 'utf8');
  const match = content.match(/ndkVersion\s*=?\s*['"]([\w.]+)['"]/);
  return match?.[1] ?? null;
})();

// -------- Output directory --------------------------------------------

const bundleName = `${dateOnly}-${shortSha || 'no-sha'}`;
const bundleDir = join(EVIDENCE_DIR, bundleName);
if (!existsSync(bundleDir)) {
  mkdirSync(bundleDir, { recursive: true });
}

console.log(`vv-evidence: writing bundle to ${relative(REPO_ROOT, bundleDir)}`);
if (!isClean) {
  console.warn(
    'vv-evidence: WARNING — working tree is dirty; the bundle reflects an uncommitted state.'
  );
}

// -------- Step runner -------------------------------------------------

/**
 * Run a command, write its combined stdout/stderr to `outFile`, and
 * return a status record for the manifest. Never throws — the script
 * captures failures rather than aborting.
 */
function runStep(label, cmd, args, outFile) {
  const start = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  const ms = Date.now() - start;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  let combined = stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : '');
  const passed = result.status === 0;
  if (combined.trim().length === 0) {
    if (passed) {
      // Silent successful runs (tsc / eslint produce no output on clean
      // passes) — write a positive marker so auditors don't see an
      // empty file and assume the step was skipped, and so SHA-256s
      // differ between distinct silent runs.
      combined =
        `# ${label} produced no output on stdout/stderr.\n` +
        `# Exit code 0; this is the expected "silent success" outcome ` +
        `for tsc / eslint when there are no errors to report.\n`;
    } else {
      // Failed but produced no output. Most often: spawnSync couldn't
      // launch the binary (ENOENT — exit -1) and the error landed on
      // result.error rather than stderr. Surface that explicitly so a
      // reviewer doesn't have to dig into source to interpret the bundle.
      const errMsg = result.error
        ? `${result.error.name}: ${result.error.message}`
        : 'no error object recorded';
      combined =
        `# ${label} FAILED with no stdout/stderr output.\n` +
        `# Exit code ${result.status ?? -1} · signal ${result.signal ?? 'none'}\n` +
        `# spawnSync error: ${errMsg}\n` +
        `# This usually means the binary could not be launched — check ` +
        `the working directory and the command path.\n`;
    }
  }
  writeFileSync(outFile, combined);
  return {
    label,
    command: `${cmd} ${args.join(' ')}`,
    exitCode: result.status ?? -1,
    ms,
    passed,
    outFile: relative(REPO_ROOT, outFile),
  };
}

const steps = [];

// 1. Typecheck
steps.push(
  runStep('typecheck', 'npx', ['tsc', '--noEmit'], join(bundleDir, 'typecheck.txt'))
);

// 2. Lint
steps.push(
  runStep(
    'lint',
    'npx',
    ['eslint', 'src', 'example'],
    join(bundleDir, 'lint.txt')
  )
);

// 3. Jest with coverage. Coverage HTML + JSON summary land in a
// `coverage/` subdirectory inside the bundle so an auditor can open
// `coverage/index.html` for line-by-line drill-down, and a downstream
// tool can parse `coverage/coverage-summary.json` programmatically.
const coverageDir = join(bundleDir, 'coverage');
steps.push(
  runStep(
    'jest',
    'npx',
    [
      'jest',
      '--ci',
      '--coverage',
      '--coverageReporters=json-summary',
      '--coverageReporters=html',
      '--coverageReporters=text-summary',
      `--coverageDirectory=${coverageDir}`,
    ],
    join(bundleDir, 'jest.txt')
  )
);

// 4. Android (optional). gradlew lives inside example/android/, not at
// the repo root — pass the absolute path so spawnSync can launch it
// regardless of the collector's cwd. We also keep `-p exampleAndroid`
// so gradle's project directory matches the wrapper's parent (defensive
// against future restructuring).
if (RUN_ANDROID) {
  const exampleAndroid = join(REPO_ROOT, 'example', 'android');
  const gradlew = join(exampleAndroid, 'gradlew');
  steps.push(
    runStep(
      'android-assemble',
      gradlew,
      ['-p', exampleAndroid, ':app:assembleDebug'],
      join(bundleDir, 'android-assemble.txt')
    )
  );
}

// 5. iOS (optional)
if (RUN_IOS) {
  const exampleIos = join(REPO_ROOT, 'example', 'ios');
  steps.push(
    runStep(
      'ios-xcodebuild',
      'xcodebuild',
      [
        '-workspace',
        join(exampleIos, 'VibeNativeDicomExample.xcworkspace'),
        '-scheme',
        'VibeNativeDicomExample',
        '-configuration',
        'Debug',
        '-destination',
        'generic/platform=iOS Simulator',
        '-derivedDataPath',
        join(exampleIos, 'build'),
        'CODE_SIGN_IDENTITY=',
        'CODE_SIGNING_REQUIRED=NO',
        'CODE_SIGNING_ALLOWED=NO',
      ],
      join(bundleDir, 'ios-xcodebuild.txt')
    )
  );
}

// -------- Repo snapshot files -----------------------------------------

writeFileSync(join(bundleDir, 'git-status.txt'), git('status') + '\n');
writeFileSync(
  join(bundleDir, 'git-log-recent.txt'),
  git('log -25 --oneline') + '\n'
);

// -------- Parse jest summary into structured stats --------------------

function parseJestSummary(text) {
  // Jest's default reporter writes:
  //   Test Suites: 23 passed, 23 total
  //   Tests:       251 passed, 251 total
  const suitesMatch = text.match(
    /Test Suites:[^\n]*?(\d+) passed,[^\n]*?(\d+) total/
  );
  const testsMatch = text.match(
    /Tests:[^\n]*?(\d+) passed,[^\n]*?(\d+) total/
  );
  return {
    suitesPassed: suitesMatch ? Number(suitesMatch[1]) : null,
    suitesTotal: suitesMatch ? Number(suitesMatch[2]) : null,
    testsPassed: testsMatch ? Number(testsMatch[1]) : null,
    testsTotal: testsMatch ? Number(testsMatch[2]) : null,
  };
}
const jestStep = steps.find((s) => s.label === 'jest');
const jestStats = jestStep
  ? parseJestSummary(readFileSync(join(REPO_ROOT, jestStep.outFile), 'utf8'))
  : null;

// -------- Coverage summary (Phase 9.2) --------------------------------
//
// Jest's json-summary reporter writes coverage-summary.json with a
// `total` block keyed by metric (statements/branches/functions/lines),
// each carrying { total, covered, skipped, pct }. We surface only the
// `pct` values in the manifest; the raw JSON stays inside the bundle
// for any downstream tool that needs the full breakdown.
function readCoverageSummary() {
  const summaryPath = join(coverageDir, 'coverage-summary.json');
  if (!existsSync(summaryPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(summaryPath, 'utf8'));
    const t = parsed?.total;
    if (!t) return null;
    return {
      statementsPct: t.statements?.pct ?? null,
      branchesPct: t.branches?.pct ?? null,
      functionsPct: t.functions?.pct ?? null,
      linesPct: t.lines?.pct ?? null,
      raw: t,
    };
  } catch {
    return null;
  }
}
const coverage = readCoverageSummary();

// -------- File SHA-256 manifest ---------------------------------------

function sha256(path) {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
}
const fileHashes = steps.map((s) => ({
  file: s.outFile,
  sha256: sha256(join(REPO_ROOT, s.outFile)),
}));

// -------- manifest.json + manifest.md ---------------------------------

const manifest = {
  // Schema 2 adds the `coverage` block (Phase 9.2). Schema 1 manifests
  // remain readable — downstream tools can branch on the presence of
  // `coverage` or version-check this field.
  schema: 'vv-evidence/2',
  generatedAt: isoNow,
  bundle: bundleName,
  git: {
    headSha,
    shortSha,
    branch,
    commitMessage,
    commitDate,
    describedTag,
    workingTreeClean: isClean,
  },
  tooling: {
    nodeVersion,
    npmVersion,
    xcodeVersion,
    ndkVersion,
  },
  steps,
  jestStats,
  coverage,
  fileHashes,
};

writeFileSync(
  join(bundleDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);

function renderMarkdown(m) {
  const lines = [];
  lines.push(`# V&V Evidence Bundle — ${m.bundle}`);
  lines.push('');
  lines.push(`**Generated:** ${m.generatedAt}`);
  lines.push(`**Schema:** ${m.schema}`);
  lines.push('');
  lines.push('## Git state');
  lines.push('');
  lines.push(`- HEAD: \`${m.git.headSha}\` (${m.git.describedTag})`);
  lines.push(`- Branch: \`${m.git.branch}\``);
  lines.push(`- Commit message: \`${m.git.commitMessage}\``);
  lines.push(`- Commit date: ${m.git.commitDate}`);
  lines.push(
    `- Working tree clean: ${m.git.workingTreeClean ? '✅' : '⚠️ dirty'}`
  );
  lines.push('');
  lines.push('## Tooling');
  lines.push('');
  lines.push(`- Node: \`${m.tooling.nodeVersion}\``);
  lines.push(`- npm: \`${m.tooling.npmVersion ?? 'unknown'}\``);
  lines.push(`- Xcode: \`${m.tooling.xcodeVersion ?? 'not collected'}\``);
  lines.push(`- Android NDK (configured): \`${m.tooling.ndkVersion ?? 'unknown'}\``);
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  lines.push('| Step | Status | Exit | Duration | Log |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const s of m.steps) {
    const basename = s.outFile.split('/').pop();
    lines.push(
      `| ${s.label} | ${s.passed ? '✅ pass' : '❌ FAIL'} | \`${s.exitCode}\` | ${s.ms} ms | [\`${basename}\`](./${basename}) |`
    );
  }
  lines.push('');
  if (m.jestStats) {
    lines.push('## Jest summary');
    lines.push('');
    lines.push(`- Suites: ${m.jestStats.suitesPassed}/${m.jestStats.suitesTotal} passed`);
    lines.push(`- Tests:  ${m.jestStats.testsPassed}/${m.jestStats.testsTotal} passed`);
    lines.push('');
  }
  if (m.coverage) {
    const fmt = (pct) => (pct == null ? '—' : `${pct.toFixed(2)}%`);
    lines.push('## Coverage');
    lines.push('');
    lines.push('Full HTML drill-down: [`coverage/index.html`](./coverage/index.html)');
    lines.push('');
    lines.push('| Metric | Coverage |');
    lines.push('| --- | --- |');
    lines.push(`| Statements | ${fmt(m.coverage.statementsPct)} |`);
    lines.push(`| Branches | ${fmt(m.coverage.branchesPct)} |`);
    lines.push(`| Functions | ${fmt(m.coverage.functionsPct)} |`);
    lines.push(`| Lines | ${fmt(m.coverage.linesPct)} |`);
    lines.push('');
  }
  lines.push('## File hashes (SHA-256)');
  lines.push('');
  for (const f of m.fileHashes) {
    lines.push(`- \`${f.sha256}\`  \`${f.file}\``);
  }
  lines.push('');
  return lines.join('\n');
}
writeFileSync(join(bundleDir, 'manifest.md'), renderMarkdown(manifest));

// -------- Summary + exit ----------------------------------------------

const failed = steps.filter((s) => !s.passed);
console.log('');
console.log(`vv-evidence: ${steps.length} step(s) ran`);
for (const s of steps) {
  console.log(
    `  ${s.passed ? '✓' : '✗'} ${s.label.padEnd(20)} ${s.ms}ms · exit ${s.exitCode}`
  );
}
if (jestStats) {
  console.log(
    `  jest:    suites ${jestStats.suitesPassed}/${jestStats.suitesTotal}, tests ${jestStats.testsPassed}/${jestStats.testsTotal}`
  );
}
if (coverage) {
  const f = (p) => (p == null ? '—' : `${p.toFixed(1)}%`);
  console.log(
    `  cov:     stmts ${f(coverage.statementsPct)}, branches ${f(coverage.branchesPct)}, fns ${f(coverage.functionsPct)}, lines ${f(coverage.linesPct)}`
  );
}
console.log(
  `vv-evidence: bundle written to ${relative(REPO_ROOT, bundleDir)}/manifest.{json,md}`
);

process.exit(failed.length === 0 ? 0 : 1);
