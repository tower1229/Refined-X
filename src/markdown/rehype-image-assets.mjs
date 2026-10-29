import { visit } from 'unist-util-visit';
import { findAsset, loadAssetManifest } from '../lib/assets.mjs';

/** Public Markdown URLs need an explicit manifest; Astro leaves them untouched. */
export function rehypeImageAssets({ publicDir, base = '' }) {
	const manifest = loadAssetManifest(publicDir);
	const prefix = base.replace(/\/$/, '');
	return (tree) => {
		visit(tree, 'element', (node) => {
			if (node.tagName !== 'img') return;
			node.properties.loading ??= 'lazy';
			node.properties.decoding ??= 'async';
			const src = String(node.properties.src ?? '');
			const asset = findAsset(manifest, src);
			if (!asset) return;
			if (asset.width && asset.height) {
				const authoredWidth = Number(node.properties.width);
				const authoredHeight = Number(node.properties.height);
				node.properties.width = authoredWidth || (authoredHeight ? Math.round(authoredHeight * asset.width / asset.height) : asset.width);
				node.properties.height = authoredHeight || (authoredWidth ? Math.round(authoredWidth * asset.height / asset.width) : asset.height);
				const style = String(node.properties.style ?? '');
				if (/(?:^|;)\s*height\s*:/.test(style) && !/(?:^|;)\s*width\s*:/.test(style)) node.properties.style = `${style};width:auto`;
			}
			if (asset.variants?.length) {
				node.properties.src = `${prefix}${asset.variants.at(-1).src}`;
				node.properties.srcSet = asset.variants.map(({ src, width }) => `${prefix}${src} ${width}w`).join(', ');
				node.properties.sizes ??= '(max-width: 720px) calc(100vw - 40px), 680px';
			} else node.properties.src = `${prefix}${src}`;
		});
	};
}
