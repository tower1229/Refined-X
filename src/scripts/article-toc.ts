const TOPBAR_OFFSET = 88;

function reconcileLinks(layout: HTMLElement, headings: HTMLElement[]) {
	const groups = [
		layout.querySelector('.article-toc-mobile'),
		layout.querySelector('.article-toc-rail'),
	];

	for (const group of groups) {
		if (!group) continue;
		const links = Array.from(group.querySelectorAll<HTMLAnchorElement>('.article-toc-link'));
		if (links.length !== headings.length) continue;

		headings.forEach((heading, index) => {
			const link = links[index];
			if (!link) return;
			if (heading.id) {
				link.href = `#${heading.id}`;
				link.dataset.tocSlug = heading.id;
			} else if (link.dataset.tocSlug) {
				heading.id = link.dataset.tocSlug;
			}
		});
	}
}

function setActiveLink(layout: HTMLElement, slug: string) {
	layout.querySelectorAll<HTMLAnchorElement>('.article-toc-link').forEach((link) => {
		const linkSlug = link.dataset.tocSlug ?? link.hash.slice(1);
		const isActive = linkSlug === slug;
		link.classList.toggle('is-active', isActive);
		if (isActive) {
			const railNav = link.closest('.article-toc-rail .article-toc-nav');
			if (railNav instanceof HTMLElement) {
				const { top, bottom } = link.getBoundingClientRect();
				const navRect = railNav.getBoundingClientRect();
				if (top < navRect.top + 4 || bottom > navRect.bottom - 4) {
					link.scrollIntoView({ block: 'nearest' });
				}
			}
		}
	});
}

function activeHeadingId(headings: HTMLElement[]): string {
	let active = headings[0]?.id ?? '';
	for (const heading of headings) {
		if (heading.getBoundingClientRect().top <= TOPBAR_OFFSET + 12) {
			active = heading.id;
		}
	}
	return active;
}

export function initArticleToc(root: ParentNode = document) {
	const layout = root.querySelector<HTMLElement>('.article-layout[data-toc]');
	if (!layout) return;

	const body = layout.querySelector<HTMLElement>('.article-body');
	if (!body) return;

	const headings = Array.from(body.querySelectorAll<HTMLElement>('h2, h3, h4'));
	if (headings.length < 2) return;

	reconcileLinks(layout, headings);

	let activeSlug = '';
	const updateActive = () => {
		const next = activeHeadingId(headings);
		if (!next || next === activeSlug) return;
		activeSlug = next;
		setActiveLink(layout, next);
	};

	const onScroll = () => requestAnimationFrame(updateActive);
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('hashchange', updateActive);
	updateActive();

	const hash = decodeURIComponent(window.location.hash.slice(1));
	if (hash && headings.some((h) => h.id === hash)) {
		activeSlug = hash;
		setActiveLink(layout, hash);
	}
}
