import path from 'node:path';
import { visit } from 'unist-util-visit';

const imageExtension = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

function assetUrl(value) {
	const clean = value.split('|', 1)[0].split('#', 1)[0].trim();
	if (!imageExtension.test(clean)) return undefined;
	return `/asset/${encodeURIComponent(path.basename(clean))}`;
}

export function remarkObsidianAssets() {
	return (tree) => {
		visit(tree, 'image', (node) => {
			const match = /^\[\[([^\]]+)\]\]$/.exec(node.url);
			if (match) node.url = assetUrl(match[1]) ?? node.url;
		});

		visit(tree, 'text', (node, index, parent) => {
			if (index === undefined || !parent) return;
			const match = /^!?\[\[([^\]]+)\]\]$/.exec(node.value.trim());
			const url = match ? assetUrl(match[1]) : undefined;
			if (url) parent.children[index] = { type: 'image', url, alt: '' };
		});
	};
}
