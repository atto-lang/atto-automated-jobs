#!/usr/bin/env node
'use strict';

// Read-only independent-review admission gate. No PR-head code is executed.
// A PASS is supplemental evidence; protected source-repository checks and
// eligible GitHub approvals remain mandatory.
const SHA = /^[0-9a-f]{40}$/i;
const REPO = /^atto-lang\/atto-source\.[a-z][a-z0-9-]*$/;
const CHECK_NAMES = Object.freeze({
  openai: 'atto-review/openai',
  anthropic: 'atto-review/anthropic',
});

function numericId(value) {
  const text = String(value ?? '');
  return /^[1-9][0-9]*$/.test(text) && Number.isSafeInteger(Number(text))
    ? Number(text) : null;
}

function configFromEnv(env = process.env) {
  const config = {
    humans: {
      the1mills: numericId(env.ATTO_THE1MILLS_USER_ID || '2148448'),
      ORESoftware: numericId(env.ATTO_ORESOFTWARE_USER_ID),
    },
    apps: {
      openai: numericId(env.ATTO_OPENAI_APP_ID),
      anthropic: numericId(env.ATTO_ANTHROPIC_APP_ID),
    },
    aiReviewers: {
      openai: numericId(env.ATTO_OPENAI_REVIEWER_ID),
      anthropic: numericId(env.ATTO_ANTHROPIC_REVIEWER_ID),
    },
  };
  return config;
}

function evaluate({ repo, pr, reviews, checks, users, repoId, expectedHead }, config) {
  const blockers = [];
  const receipt = { head: pr?.head?.sha || null, human: {}, aiReview: {}, ai: {} };
  if (!REPO.test(repo || '')) blockers.push('unallowlisted target repository');
  if (!SHA.test(pr?.head?.sha || '')) blockers.push('missing/invalid PR head SHA');
  if (expectedHead && expectedHead !== pr?.head?.sha) blockers.push('PR head SHA changed');
  if (pr?.base?.repo?.full_name !== repo || pr?.base?.repo?.id !== repoId)
    blockers.push('PR base repository identity mismatch');
  if (pr?.state !== 'open') blockers.push('PR is not open');
  if (pr?.draft !== false) blockers.push('PR remains draft');
  if (!numericId(pr?.user?.id)) blockers.push('PR author identity missing');
  for (const [label, id] of Object.entries(config.humans || {})) {
    if (!numericId(id)) blockers.push(label + ': unconfigured pinned human ID');
    if (users?.[label]?.id !== id || users?.[label]?.login?.toLowerCase() !== label.toLowerCase())
      blockers.push(label + ': GitHub account does not match pinned identity');
    if (id && pr?.user?.id === id) blockers.push(label + ': author cannot self-approve');
  }
  const humanIds = Object.values(config.humans || {});
  if (humanIds.length !== 2 || new Set(humanIds).size !== 2)
    blockers.push('human reviewer identities must be distinct');
  const aiReviewerIds = Object.values(config.aiReviewers || {});
  if (aiReviewerIds.length !== 2 || !aiReviewerIds.every(numericId) ||
      new Set([...humanIds, ...aiReviewerIds]).size !== 4)
    blockers.push('four GitHub review identities must be pinned and distinct');
  const appIds = Object.values(config.apps || {});
  if (appIds.length !== 2 || !appIds.every(numericId) || new Set(appIds).size !== 2)
    blockers.push('OpenAI and Anthropic require two distinct pinned GitHub Apps');

  // The GitHub API returns reviews in chronological order. Sort by immutable
  // review ID as an extra guard, and take the latest substantive review per user.
  const latest = new Map();
  if (!Array.isArray(reviews)) blockers.push('reviews not available');
  for (const review of Array.isArray(reviews) ? [...reviews].sort((a, b) => a.id - b.id) : []) {
    if (!numericId(review?.id) || !numericId(review?.user?.id)) {
      blockers.push('unattributable GitHub review'); continue;
    }
    const state = review.state;
    if (state === 'APPROVED' || state === 'CHANGES_REQUESTED' || state === 'DISMISSED') {
      latest.set(review.user.id, review);
    }
  }
  for (const [label, id] of Object.entries(config.humans || {})) {
    const review = latest.get(id);
    receipt.human[label] = review ? { reviewId: review.id, state: review.state, commit: review.commit_id } : null;
    if (!review || review.state !== 'APPROVED' || review.commit_id !== pr?.head?.sha ||
        !review.submitted_at || review.user?.type !== 'User') {
      blockers.push(label + ': no effective APPROVED review on current exact head');
    }
  }
  // Provider-owned checks complement, but never replace, real submitted
  // GitHub APPROVED bot reviews by distinct allowlisted reviewer accounts.
  for (const [family, id] of Object.entries(config.aiReviewers || {})) {
    const review = latest.get(id);
    receipt.aiReview[family] = review ?
      { reviewId: review.id, state: review.state, commit: review.commit_id, botId: review.user?.id } : null;
    if (id && pr?.user?.id === id) blockers.push(family + ': PR author cannot self-approve');
    if (!review || review.state !== 'APPROVED' || review.commit_id !== pr?.head?.sha ||
        !review.submitted_at || review.user?.type !== 'Bot') {
      blockers.push(family + ': no formal APPROVED GitHub bot review on current exact head');
    }
  }
  for (const review of latest.values()) {
    if (review.state === 'CHANGES_REQUESTED') {
      blockers.push('unresolved CHANGES_REQUESTED from GitHub user ' + review.user.id);
    }
  }

  // Do not accept a status name or comment as proof of reviewer identity.
  // Each provider must own its exact check through a distinct, pinned App ID.
  if (!Array.isArray(checks)) blockers.push('check runs not available');
  for (const [family, name] of Object.entries(CHECK_NAMES)) {
    const matching = (Array.isArray(checks) ? checks : []).filter(x => x?.name === name);
    const appId = config.apps?.[family];
    const newest = matching.reduce((a, b) => !a || b.id > a.id ? b : a, null);
    receipt.ai[family] = newest ?
      { runId: newest.id, appId: newest.app?.id, conclusion: newest.conclusion, head: newest.head_sha } : null;
    if (matching.some(x => !numericId(x?.id) || x?.app?.id !== appId ||
        x?.head_sha !== pr?.head?.sha)) {
      blockers.push(family + ': spoofed/unattributed/stale check run');
    }
    if (!newest || newest.app?.id !== appId || newest.head_sha !== pr?.head?.sha ||
        newest.status !== 'completed' || newest.conclusion !== 'success') {
      blockers.push(family + ': no completed successful review by pinned provider App');
    }
  }
  return { pass: blockers.length === 0, blockers: [...new Set(blockers)], receipt };
}

async function api(path, token) {
  if (!path.startsWith('/') || path.includes('..')) throw Error('unsafe API path');
  const response = await fetch('https://api.github.com' + path, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'atto-parity-review-gate' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw Error('GitHub API ' + response.status + ' on ' + path.split('?')[0]);
  return response.json();
}

async function pages(path, token) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const join = path.includes('?') ? '&' : '?';
    const response = await api(path + join + 'per_page=100&page=' + page, token);
    const items = Array.isArray(response) ? response : response?.check_runs;
    if (!Array.isArray(items)) throw Error('unexpected paginated GitHub API shape');
    all.push(...items);
    if (items.length < 100) return all;
  }
  throw Error('GitHub pagination cap reached: fail closed');
}

async function collect(repo, number, token) {
  if (!REPO.test(repo) || !/^[1-9][0-9]*$/.test(String(number)))
    throw Error('unallowlisted repo or invalid PR number');
  const base = '/repos/' + repo;
  const [pr, repository, reviews, users1, users2] = await Promise.all([
    api(base + '/pulls/' + number, token),
    api(base, token),
    pages(base + '/pulls/' + number + '/reviews', token),
    api('/users/the1mills', token), api('/users/ORESoftware', token),
  ]);
  if (!SHA.test(pr?.head?.sha || '')) throw Error('invalid live PR SHA');
  const checks = await pages(base + '/commits/' + pr.head.sha + '/check-runs', token);
  const latest = await api(base + '/pulls/' + number, token);
  if (latest.head?.sha !== pr.head.sha || latest.updated_at !== pr.updated_at)
    throw Error('PR changed during verification; rerun on latest head');
  return {
    repo, pr, reviews, checks, repoId: repository.id,
    users: { the1mills: users1, ORESoftware: users2 }, expectedHead: pr.head.sha,
  };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length !== 2) throw Error('usage: node scripts/review-gate.cjs atto-lang/atto-source.<backend> <pr-number>');
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw Error('GITHUB_TOKEN/GH_TOKEN not configured');
  const config = configFromEnv(env);
  if (!Object.values(config.humans).every(numericId) ||
      !Object.values(config.apps).every(numericId) ||
      !Object.values(config.aiReviewers).every(numericId))
    throw Error('pinned identities missing; fail closed');
  const evidence = await collect(argv[0], argv[1], token);
  const result = evaluate(evidence, config);
  console.log(JSON.stringify({ repo: argv[0], pr: Number(argv[1]), ...result }, null, 2));
  if (!result.pass) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error('REVIEW GATE BLOCKED: ' + error.message);
  process.exitCode = 1;
});

module.exports = { numericId, configFromEnv, evaluate, collect, pages, CHECK_NAMES };
