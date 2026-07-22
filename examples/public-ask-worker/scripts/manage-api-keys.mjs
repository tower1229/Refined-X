import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApiKeyCredential, digestApiKeySecret } from '../src/api-keys.ts';

const DATABASE = 'refined-x-public-ask';
const KEY_ID = /^[A-Za-z0-9_-]{16}$/;

function quote(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function assertKeyId(keyId) {
	if (!KEY_ID.test(keyId)) throw new Error('key id must be 16 base64url characters');
}

function assertDailyLimit(value) {
	if (!Number.isSafeInteger(value) || value < 1) throw new Error('daily limit must be a positive integer');
}

function normalizeModes(modes) {
	const unique = [...new Set(modes)];
	if (unique.length === 0 || unique.some((mode) => mode !== 'list' && mode !== 'summarize')) {
		throw new Error('modes must contain list and/or summarize');
	}
	return unique;
}

export async function buildIssueRecord({ name, modes, dailyLimit }, randomBytes) {
	if (!name?.trim()) throw new Error('name is required');
	assertDailyLimit(dailyLimit);
	const credential = createApiKeyCredential(randomBytes);
	return {
		...credential,
		secretDigest: await digestApiKeySecret(credential.secret),
		name: name.trim(),
		modes: normalizeModes(modes),
		dailyLimit,
		issuedAt: new Date().toISOString(),
	};
}

export function issueSql(record) {
	return `INSERT INTO public_ask_api_keys(key_id, secret_digest, name, status, allowed_modes, daily_limit, issued_at) VALUES(${quote(record.keyId)}, ${quote(record.secretDigest)}, ${quote(record.name)}, 'active', ${quote(JSON.stringify(record.modes))}, ${record.dailyLimit}, ${quote(record.issuedAt)}); SELECT changes() AS changed;`;
}

export function rotateSql(keyId, secretDigest, rotatedAt) {
	assertKeyId(keyId);
	if (!/^[a-f0-9]{64}$/.test(secretDigest)) throw new Error('secret digest is invalid');
	return `UPDATE public_ask_api_keys SET secret_digest = ${quote(secretDigest)}, status = 'active', rotated_at = ${quote(rotatedAt)}, revoked_at = NULL WHERE key_id = ${quote(keyId)}; SELECT changes() AS changed;`;
}

export function setQuotaSql(keyId, dailyLimit) {
	assertKeyId(keyId);
	assertDailyLimit(dailyLimit);
	return `UPDATE public_ask_api_keys SET daily_limit = ${dailyLimit} WHERE key_id = ${quote(keyId)}; SELECT changes() AS changed;`;
}

export function revokeSql(keyId, revokedAt) {
	assertKeyId(keyId);
	return `UPDATE public_ask_api_keys SET status = 'revoked', revoked_at = ${quote(revokedAt)} WHERE key_id = ${quote(keyId)}; SELECT changes() AS changed;`;
}

function option(args, name) {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

function runSql(sql, local) {
	const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
	const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', DATABASE, local ? '--local' : '--remote', '--command', sql, '--json', '--yes'], {
		encoding: 'utf8',
	});
	if (result.status !== 0) throw new Error(result.stderr?.trim() || `wrangler d1 execute failed with status ${result.status}`);
	const payload = JSON.parse(result.stdout);
	const changed = payload.at(-1)?.results?.at(-1)?.changed;
	if (changed !== 1) throw new Error('API key mutation did not affect exactly one record');
}

async function main(args) {
	const [command] = args;
	const local = args.includes('--local');
	if (command === 'issue') {
		const record = await buildIssueRecord({
			name: option(args, '--name'),
			modes: (option(args, '--modes') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
			dailyLimit: Number(option(args, '--daily-limit')),
		});
		runSql(issueSql(record), local);
		console.log(`API key (shown once): ${record.plaintext}`);
		return;
	}
	const keyId = option(args, '--id');
	if (command === 'rotate') {
		assertKeyId(keyId);
		const credential = createApiKeyCredential();
		const digest = await digestApiKeySecret(credential.secret);
		runSql(rotateSql(keyId, digest, new Date().toISOString()), local);
		console.log(`API key (shown once): pask_${keyId}_${credential.secret}`);
		return;
	}
	if (command === 'set-quota') {
		runSql(setQuotaSql(keyId, Number(option(args, '--daily-limit'))), local);
		return;
	}
	if (command === 'revoke') {
		runSql(revokeSql(keyId, new Date().toISOString()), local);
		return;
	}
	throw new Error('usage: manage-api-keys.mjs <issue|rotate|set-quota|revoke> [options] [--local]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
