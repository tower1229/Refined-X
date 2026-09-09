import assert from 'node:assert/strict';
import test from 'node:test';
import {
	AWP_DRAFT_VERSION,
	AWP_MANIFEST_PATHS,
	PHASE1_AWP_ACTION_IDS,
	buildAwpManifest,
	isAwpDiscoveryEnabled,
	serializeAwpManifest,
} from './awp-manifest.ts';
import {
	PROTOCOL_PROFILE_DUAL_ERA,
	resolvePublicCapabilities,
} from './public-capabilities.ts';

const identity = {
	title: 'Refined-X',
	mcp: {
		packageIdentifier: 'com.example/refined-x-public-ask',
		airIdentifier: 'urn:air:example.com:public-ask',
	},
};

function caps(ask: {
	askUrl?: string;
	mcpUrl?: string;
	healthUrl?: string;
	protocolProfile?: string;
} = {}, site = 'https://example.com/') {
	return resolvePublicCapabilities({
		site,
		title: identity.title,
		ask: {
			askUrl: ask.askUrl ?? '',
			mcpUrl: ask.mcpUrl ?? '',
			healthUrl: ask.healthUrl ?? '',
			protocolProfile: ask.protocolProfile,
		},
		mcp: identity.mcp,
	});
}

/**
 * Top-level keys of real static JSON APIs (from public-data / api routes).
 * Phase-1 AWP outputs are an intentional subset — not a full-field mirror.
 */
const REAL_PROFILE_KEYS = [
	'id',
	'name',
	'alternateName',
	'jobTitle',
	'description',
	'url',
	'sameAs',
	'email',
	'wechat',
	'github',
	'stats',
	'knowsAbout',
	'cooperation',
] as const;

const REAL_ARTICLES_RESPONSE_KEYS = ['count', 'articles'] as const;

const REAL_ARTICLE_SUMMARY_KEYS = [
	'id',
	'title',
	'description',
	'llmSummary',
	'url',
	'pubDate',
	'updatedDate',
	'tags',
	'seoImage',
	'markdownUrl',
] as const;

const REAL_TOPICS_RESPONSE_KEYS = ['count', 'topics'] as const;

const REAL_TOPIC_SUMMARY_KEYS = ['name', 'slug', 'url', 'articleCount', 'articles'] as const;

const REAL_SEARCH_INDEX_KEYS = ['articles', 'answers', 'items'] as const;

test('AWP draft version pin is 0.2 (not validator patch)', () => {
	assert.equal(AWP_DRAFT_VERSION, '0.2');
});

test('discovery.awp defaults off and only true enables output', () => {
	assert.equal(isAwpDiscoveryEnabled({}), false);
	assert.equal(isAwpDiscoveryEnabled({ discovery: undefined }), false);
	assert.equal(isAwpDiscoveryEnabled({ discovery: { awp: false } }), false);
	assert.equal(isAwpDiscoveryEnabled({ discovery: { awp: true } }), true);
	assert.equal(isAwpDiscoveryEnabled({ discovery: { awp: 'yes' as unknown as boolean } }), false);
});

test('manifest required top-level fields and phase-1 static read actions', () => {
	const manifest = buildAwpManifest(caps(), {
		intent: 'Public personal site with static JSON APIs',
		siteBasePath: '/',
	});
	assert.equal(manifest.awp_version, '0.2');
	assert.equal(manifest.domain, 'example.com');
	assert.equal(typeof manifest.intent, 'string');
	assert.ok(manifest.intent.length > 0);
	assert.ok(Array.isArray(manifest.actions));

	const ids = manifest.actions.map((action) => action.id);
	assert.deepEqual(ids, [...PHASE1_AWP_ACTION_IDS]);

	for (const action of manifest.actions) {
		assert.equal(typeof action.description, 'string');
		assert.equal(action.auth_required, false);
		assert.ok(action.inputs && typeof action.inputs === 'object');
		assert.ok(action.outputs && typeof action.outputs === 'object');
		assert.equal(action.method, 'GET');
		assert.equal(typeof action.endpoint, 'string');
		assert.ok(!('via' in action));
	}

	const search = manifest.actions.find((action) => action.id === 'get_search_index');
	assert.ok(search);
	assert.match(search.description, /index retrieval/i);
	assert.match(search.description, /not a query search/i);
});

test('phase-1 actions do not project Ask as a single auth_required action', () => {
	const manifest = buildAwpManifest(
		caps({
			askUrl: 'https://ask.example.com/ask',
			mcpUrl: 'https://ask.example.com/mcp',
			protocolProfile: PROTOCOL_PROFILE_DUAL_ERA,
		}),
		{ intent: 'Live Ask enabled site', siteBasePath: '/' },
	);
	assert.ok(!manifest.actions.some((action) => /ask/i.test(action.id)));
	assert.ok(!manifest.actions.some((action) => action.auth_required === true));
});

test('protocols.mcp appears only with accepted profile versions and real endpoint', () => {
	const staticManifest = buildAwpManifest(caps(), { intent: 'static', siteBasePath: '/' });
	assert.equal(staticManifest.protocols, undefined);

	const undeclared = buildAwpManifest(caps({ mcpUrl: 'https://ask.example.com/mcp' }), {
		intent: 'mcp undeclared',
		siteBasePath: '/',
	});
	assert.equal(undeclared.protocols, undefined);

	const dual = buildAwpManifest(
		caps({ mcpUrl: 'https://ask.example.com/agent/mcp', protocolProfile: PROTOCOL_PROFILE_DUAL_ERA }),
		{ intent: 'mcp dual-era', siteBasePath: '/' },
	);
	assert.ok(dual.protocols?.mcp);
	assert.equal(dual.protocols.mcp.endpoint, 'https://ask.example.com/agent/mcp');
	assert.equal(dual.protocols.mcp.version, '2026-07-28');
	assert.equal((dual.protocols as Record<string, unknown>)['mcp-v1'], undefined);
	assert.equal((dual.protocols as Record<string, unknown>)['mcp-v2'], undefined);
	assert.equal('supportedVersions' in dual.protocols.mcp, false);
	assert.equal('transport' in dual.protocols.mcp, false);
});

test('serializeAwpManifest is stable JSON and both paths share one serialization', () => {
	const manifest = buildAwpManifest(caps(), { intent: 'Public site', siteBasePath: '/' });
	const a = serializeAwpManifest(manifest);
	const b = serializeAwpManifest(manifest);
	assert.equal(a, b);
	assert.ok(a.endsWith('\n'));
	assert.deepEqual(JSON.parse(a), manifest);
	assert.deepEqual(AWP_MANIFEST_PATHS, ['/agent.json', '/.well-known/agent.json']);
});

test('action endpoints respect site base path without claiming a second copy of the API', () => {
	const manifest = buildAwpManifest(caps({}, 'https://user.github.io/refined-x/'), {
		intent: 'Project pages deploy',
		siteBasePath: '/refined-x/',
	});
	assert.equal(manifest.domain, 'user.github.io');
	assert.equal(manifest.actions[0]?.endpoint, '/refined-x/api/profile.json');
});

test('typed entities match referenced action outputs (no unused search_index entity)', () => {
	const manifest = buildAwpManifest(caps(), { intent: 'typed', siteBasePath: '/' });
	assert.ok(manifest.entities?.profile);
	assert.ok(manifest.entities?.article_summary);
	assert.ok(manifest.entities?.topic_summary);
	assert.equal(manifest.entities?.search_index, undefined);

	const profileOut = manifest.actions.find((a) => a.id === 'get_profile')?.outputs;
	assert.equal(profileOut?.name, 'string');
	assert.equal(profileOut?.url, 'url');
	for (const key of Object.keys(manifest.entities!.profile.fields)) {
		assert.ok(key in profileOut!, `profile entity field ${key} missing from get_profile outputs`);
	}

	const articlesOut = manifest.actions.find((a) => a.id === 'list_articles')?.outputs;
	assert.equal(articlesOut?.count, 'integer');
	assert.equal(articlesOut?.articles, 'array[article_summary]');

	const indexOut = manifest.actions.find((a) => a.id === 'get_search_index')?.outputs;
	assert.equal(indexOut?.articles, 'array[object]');
	assert.equal(indexOut?.items, 'array[object]');
});

test('phase-1 outputs are an intentional subset of real static API top-level keys', () => {
	const manifest = buildAwpManifest(caps(), { intent: 'subset contract', siteBasePath: '/' });
	assert.deepEqual(
		manifest.actions.map((a) => a.id),
		[...PHASE1_AWP_ACTION_IDS],
	);

	const profileKeys = new Set<string>(REAL_PROFILE_KEYS);
	for (const key of Object.keys(manifest.actions.find((a) => a.id === 'get_profile')!.outputs)) {
		assert.ok(profileKeys.has(key), `get_profile output ${key} not in real profile keys`);
	}

	const articlesKeys = new Set<string>(REAL_ARTICLES_RESPONSE_KEYS);
	for (const key of Object.keys(manifest.actions.find((a) => a.id === 'list_articles')!.outputs)) {
		assert.ok(articlesKeys.has(key), `list_articles output ${key} not in real articles response`);
	}

	const articleSummaryKeys = new Set<string>(REAL_ARTICLE_SUMMARY_KEYS);
	for (const key of Object.keys(manifest.entities!.article_summary.fields)) {
		assert.ok(articleSummaryKeys.has(key), `article_summary entity ${key} not in serializeArticle keys`);
	}

	const topicsKeys = new Set<string>(REAL_TOPICS_RESPONSE_KEYS);
	for (const key of Object.keys(manifest.actions.find((a) => a.id === 'list_topics')!.outputs)) {
		assert.ok(topicsKeys.has(key), `list_topics output ${key} not in real topics response`);
	}

	const topicSummaryKeys = new Set<string>(REAL_TOPIC_SUMMARY_KEYS);
	for (const key of Object.keys(manifest.entities!.topic_summary.fields)) {
		assert.ok(topicSummaryKeys.has(key), `topic_summary entity ${key} not in real topic shape`);
	}

	const searchKeys = new Set<string>(REAL_SEARCH_INDEX_KEYS);
	for (const key of Object.keys(manifest.actions.find((a) => a.id === 'get_search_index')!.outputs)) {
		assert.ok(searchKeys.has(key), `get_search_index output ${key} not in real search-index keys`);
	}
});
