export type GiscusTheme = 'light' | 'dark';

export const GISCUS_ORIGIN = 'https://giscus.app';

export type GiscusPublicConfig = {
	repo: string;
	repoId: string;
	category: string;
	categoryId: string;
	term: string;
	lang: string;
};

export function resolveGiscusTheme(documentElement: Pick<HTMLElement, 'dataset'>): GiscusTheme {
	return documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function giscusScriptAttributes(config: GiscusPublicConfig, theme: GiscusTheme) {
	return {
		repo: config.repo,
		'repo-id': config.repoId,
		category: config.category,
		'category-id': config.categoryId,
		mapping: 'specific',
		term: config.term,
		strict: '1',
		'reactions-enabled': '1',
		'emit-metadata': '0',
		'input-position': 'bottom',
		theme,
		lang: config.lang,
		loading: 'lazy',
	} as const;
}

export function giscusThemeMessage(theme: GiscusTheme) {
	return { giscus: { setConfig: { theme } } } as const;
}

export function postGiscusTheme(
	frame: Pick<HTMLIFrameElement, 'contentWindow'> | null,
	theme: GiscusTheme,
) {
	frame?.contentWindow?.postMessage(giscusThemeMessage(theme), GISCUS_ORIGIN);
}

function readConfig(root: HTMLElement): GiscusPublicConfig | null {
	const { repo, repoId, category, categoryId, term, lang } = root.dataset;
	if (!repo || !repoId || !category || !categoryId || !term || !lang) return null;
	return { repo, repoId, category, categoryId, term, lang };
}

export function initGiscusComments(root: HTMLElement) {
	if (root.dataset.giscusInitialized === 'true') return;
	const config = readConfig(root);
	const mount = root.querySelector<HTMLElement>('[data-giscus-mount]');
	const status = root.querySelector<HTMLElement>('[data-giscus-status]');
	if (!config || !mount) return;

	root.dataset.giscusInitialized = 'true';
	const script = document.createElement('script');
	script.src = `${GISCUS_ORIGIN}/client.js`;
	script.async = true;
	script.crossOrigin = 'anonymous';

	for (const [name, value] of Object.entries(
		giscusScriptAttributes(config, resolveGiscusTheme(document.documentElement)),
	)) {
		script.setAttribute(`data-${name}`, value);
	}

	const markUnavailable = () => {
		root.classList.add('is-unavailable');
		if (status) status.textContent = root.dataset.unavailableLabel ?? '';
	};
	script.addEventListener('error', markUnavailable, { once: true });

	let frameReady = false;
	const mountObserver = new MutationObserver(() => {
		const frame = mount.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
		if (!frame) return;
		frame.addEventListener(
			'load',
			() => {
				frameReady = true;
				postGiscusTheme(frame, resolveGiscusTheme(document.documentElement));
				root.classList.add('is-ready');
				if (status) status.hidden = true;
			},
			{ once: true },
		);
		mountObserver.disconnect();
	});
	mountObserver.observe(mount, { childList: true, subtree: true });

	const themeObserver = new MutationObserver(() => {
		if (!frameReady) return;
		const frame = mount.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
		postGiscusTheme(frame, resolveGiscusTheme(document.documentElement));
	});
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});

	mount.appendChild(script);
}
