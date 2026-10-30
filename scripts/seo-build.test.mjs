import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

const root = fileURLToPath(new URL('../', import.meta.url));

function elements(node) {
	return [node, ...(node.childNodes ?? []).flatMap(elements)];
}

function text(node) {
	if (node.tagName === 'script' || node.tagName === 'style') return '';
	return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
}

async function readPage(dist, route) {
	const nodes = elements(parse(await readFile(path.join(dist, route, 'index.html'), 'utf8')));
	const meta = (key) => nodes.filter((node) => node.tagName === 'meta' && node.attrs.some(
		({ name, value }) => (name === 'name' || name === 'property') && value === key,
	)).map((node) => node.attrs.find(({ name }) => name === 'content')?.value);
	return {
		titles: nodes.filter((node) => node.tagName === 'title').map(text),
		ogTitles: meta('og:title'),
		twitterTitles: meta('twitter:title'),
		headings: nodes.filter((node) => node.tagName === 'h1').map(text),
		mainText: text(nodes.find((node) => node.tagName === 'main')).replace(/\s+/g, ' ').trim(),
	};
}

function assertTitles(page, expected) {
	for (const field of ['titles', 'ogTitles', 'twitterTitles']) {
		assert.deepEqual(page[field], [expected], field);
	}
}

test('built projects metadata adds the brand once without changing page or article content', async (t) => {
	const work = await mkdtemp(path.join(tmpdir(), 'refined-x-seo-build-'));
	t.after(() => rm(work, { recursive: true, force: true }));
	const cases = [
		{
			name: 'default', overlay: {},
			projectsTitle: 'Projects｜Refined-X', heading: 'Projects',
			lede: 'Open-source tools, product experiments, and teaching materials from the same public corpus.',
			writingTitle: 'Writing and professional practice｜Refined-X',
			articleTitle: 'Welcome to Refined-X｜Refined-X',
		},
		{
			name: 'custom',
			overlay: {
				title: 'Studio & Research', site: 'https://example.com/blog/',
				brand: { projects: { titleSuffix: 'Selected Work', heading: 'Project Library', lede: 'Independent tools and experiments.' } },
			},
			projectsTitle: 'Selected Work｜Studio & Research', heading: 'Project Library',
			lede: 'Independent tools and experiments.',
			writingTitle: 'Writing and professional practice｜Studio & Research',
			articleTitle: 'Welcome to Refined-X｜Studio & Research',
		},
	];
	for (const fixture of cases) await t.test(fixture.name, async (t) => {
		const dist = path.join(work, fixture.name);
		const overlay = path.join(work, `${fixture.name}.mjs`);
		await writeFile(overlay, `export default ${JSON.stringify({
			site: 'https://example.com', contentRoot: path.join(root, 'content'), outDir: dist, ...fixture.overlay,
		})};`);
		const env = { ...process.env, REFINED_X_INSTANCE_CONFIG: overlay };
		for (const args of [['node_modules/astro/bin/astro.mjs', 'build'], ['scripts/verify.mjs']]) {
			const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 120_000 });
			const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
			assert.equal(result.error, undefined, output);
			assert.equal(result.status, 0, output);
		}
		const projects = await readPage(dist, 'projects');
		t.diagnostic(JSON.stringify({
			case: fixture.name, titles: projects.titles, ogTitles: projects.ogTitles, twitterTitles: projects.twitterTitles,
			headings: projects.headings, mainTextSha256: createHash('sha256').update(projects.mainText).digest('hex'),
		}));
		assertTitles(projects, fixture.projectsTitle);
		assert.deepEqual(projects.headings, [fixture.heading]);
		assert.ok(projects.mainText.includes(fixture.lede));
		assert.ok(projects.mainText.includes('Sample Project'));
		assert.ok(projects.mainText.includes('A featured sample project card for the projects page.'));
		assert.ok(projects.mainText.includes('Sample Toolkit'));
		assertTitles(await readPage(dist, 'writing'), fixture.writingTitle);
		const article = await readPage(dist, '2026/07/01/welcome-to-refined-x');
		assertTitles(article, fixture.articleTitle);
		assert.deepEqual(article.headings, ['Welcome to Refined-X']);
	});
});
