#!/usr/bin/env node
// Implements SR-9001 (Traceability gate) per docs/regulatory/62304-requirements.md.
//
// Fails if any commit in the given range modifies a protected path
// (src/, ios/, android/, cpp/) without referencing at least one
// requirement ID matching /\bSR-\d{4}\b/ in its commit message.
//
// Usage:
//   node scripts/check-traceability.mjs <base> [head]
//   BASE_REF=<sha> HEAD_REF=<sha> node scripts/check-traceability.mjs
//
// Exit codes:
//   0 — all protected commits cite a requirement (or no protected commits in range)
//   1 — one or more protected commits are missing a Refs SR-XXXX reference
//   2 — usage error

import { execSync } from 'node:child_process';
import process from 'node:process';

const PROTECTED_PREFIXES = ['src/', 'ios/', 'android/', 'cpp/'];
const SR_PATTERN = /\bSR-\d{4}\b/g;
const NULL_SHA = '0000000000000000000000000000000000000000';

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' });
}

function isProtectedPath(path) {
  return PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function commitsInRange(base, head) {
  const out = git(`log --format=%H ${base}..${head}`).trim();
  return out ? out.split('\n') : [];
}

function changedFiles(commit) {
  const out = git(`diff-tree --no-commit-id --name-only -r ${commit}`).trim();
  return out ? out.split('\n').filter(Boolean) : [];
}

function commitMessage(commit) {
  return git(`show --no-patch --format=%B ${commit}`);
}

function shortSha(sha) {
  return sha.slice(0, 7);
}

function resolveRange() {
  const cliBase = process.argv[2];
  const cliHead = process.argv[3];
  const envBase = process.env.BASE_REF;
  const envHead = process.env.HEAD_REF;

  let base = cliBase || envBase;
  let head = cliHead || envHead || 'HEAD';

  if (!base) {
    console.error(
      'Usage: node scripts/check-traceability.mjs <base> [head]\n' +
        '   or: BASE_REF=<sha> HEAD_REF=<sha> node scripts/check-traceability.mjs\n'
    );
    process.exit(2);
  }

  // Handle GitHub Actions push events on brand-new branches:
  // `before` arrives as the all-zero SHA — fall back to checking the head commit only.
  if (base === NULL_SHA) {
    base = `${head}~1`;
  }

  return { base, head };
}

function main() {
  const { base, head } = resolveRange();

  let commits;
  try {
    commits = commitsInRange(base, head);
  } catch (err) {
    console.error(`Could not resolve commit range ${base}..${head}: ${err.message}`);
    process.exit(2);
  }

  if (commits.length === 0) {
    console.log(`No commits in range ${base}..${head}; nothing to check.`);
    return;
  }

  let failed = false;

  for (const commit of commits) {
    const files = changedFiles(commit);
    const protectedFiles = files.filter(isProtectedPath);

    if (protectedFiles.length === 0) {
      console.log(`· ${shortSha(commit)} — no protected paths touched, skipped`);
      continue;
    }

    const message = commitMessage(commit);
    const refs = [...new Set([...message.matchAll(SR_PATTERN)].map((m) => m[0]))];

    if (refs.length === 0) {
      console.error(
        `✗ ${shortSha(commit)} touches protected paths but has no SR-XXXX reference\n` +
          `    files:    ${protectedFiles.join(', ')}\n` +
          `    subject:  ${message.split('\n')[0]}`
      );
      failed = true;
    } else {
      console.log(`✓ ${shortSha(commit)} cites ${refs.join(', ')}`);
    }
  }

  if (failed) {
    console.error(
      '\nTraceability gate failed (SR-9001).\n' +
        'Per AGENTS.md §6.1, every commit modifying src/, ios/, android/, or cpp/\n' +
        'must include a "Refs SR-XXXX" reference in the commit body.\n' +
        '\n' +
        'Fix by either:\n' +
        '  • amending the commit message (git commit --amend) on the offending commit, or\n' +
        '  • adding a follow-up commit that references the requirement and rebasing.\n'
    );
    process.exit(1);
  }
}

main();
