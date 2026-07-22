import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIssueRecord, issueSql, rotateSql, setQuotaSql, revokeSql } from './manage-api-keys.mjs';

test('admin mutations never place the plaintext secret in D1 SQL', async () => {
	const record = await buildIssueRecord({ name: "Partner's agent", modes: ['list', 'summarize'], dailyLimit: 100 }, (length) => new Uint8Array(length).fill(9));
	const sql = issueSql(record);
	assert.match(record.plaintext, /^pask_/);
	assert.doesNotMatch(sql, new RegExp(record.secret));
	assert.match(sql, new RegExp(record.secretDigest));
	assert.match(sql, /Partner''s agent/);
});

test('builds executable rotate, quota, and revoke mutations', () => {
	assert.match(rotateSql('abcdefghijklmnop', 'a'.repeat(64), '2026-07-03T00:00:00.000Z'), /rotated_at/);
	assert.match(setQuotaSql('abcdefghijklmnop', 25), /daily_limit = 25/);
	assert.match(revokeSql('abcdefghijklmnop', '2026-07-03T00:00:00.000Z'), /status = 'revoked'/);
});
