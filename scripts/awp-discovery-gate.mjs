/**
 * When `discovery.awp` is false, remove any accidental AWP artifacts from dist
 * so verify's must-not-exist checks stay truthful under static builds.
 */

import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAwpDiscoveryEnabled, AWP_MANIFEST_PATHS } from '../src/lib/awp-manifest.ts';

/**
 * @param {{ discovery?: { awp?: boolean } }} siteConfig
 * @returns {import('astro').AstroIntegration}
 */
export function awpDiscoveryGate(siteConfig) {
	return {
		name: 'refined-x-awp-discovery-gate',
		hooks: {
			'astro:build:done': async ({ dir }) => {
				if (isAwpDiscoveryEnabled(siteConfig)) return;
				const root = fileURLToPath(dir);
				for (const manifestPath of AWP_MANIFEST_PATHS) {
					const full = path.join(root, manifestPath.replace(/^\//, ''));
					if (existsSync(full)) await unlink(full);
				}
			},
		},
	};
}
