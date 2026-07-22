import path from 'node:path';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';
import { siteConfig } from '../site.config.mjs';
import { SERIES_IDS } from './lib/series.mjs';

function fallbackSlug(entry: string) {
	return path.basename(entry, path.extname(entry));
}

function generateDocId({ data, entry }: { data: Record<string, unknown>; entry: string }) {
	const contentType = String(data.contentType ?? '');
	const slug = String(data.slug ?? fallbackSlug(entry));

	if (contentType === 'article') {
		const rawDate = String(data.pubDate ?? '');
		const localDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(rawDate);
		const date = new Date(rawDate);
		if (!localDate && Number.isNaN(date.valueOf())) throw new Error(`文章 ${entry} 缺少有效的 pubDate`);
		const year = localDate?.[1] ?? String(date.getUTCFullYear());
		const month = localDate?.[2] ?? String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = localDate?.[3] ?? String(date.getUTCDate()).padStart(2, '0');
		return `${year}/${month}/${day}/${slug}`;
	}

	if (contentType === 'answer') return `answers/${slug}`;
	if (contentType === 'profile') return 'about';
	if (contentType === 'page') return slug;
	throw new Error(`${entry} 的 contentType 必须是 article、answer、profile 或 page`);
}

const publicDocFields = z
	.object({
		contentType: z.enum(['article', 'answer', 'profile', 'page']),
		pubDate: z.coerce.date().optional(),
		updatedDate: z.coerce.date().optional(),
		slug: z.string().min(1),
		series: z.enum(SERIES_IDS).optional(),
		tags: z.array(z.string()).default([]),
		llmSummary: z.string().min(1),
		seoImage: z.union([z.string().startsWith('/'), z.url()]).optional(),
		question: z.string().min(1).optional(),
		shortAnswer: z.string().min(1).optional(),
		legacySource: z.string().optional(),
		legacyUrl: z.string().startsWith('/').optional(),
	})
	.superRefine((data, context) => {
		if (data.contentType === 'article' && !data.pubDate) {
			context.addIssue({ code: 'custom', path: ['pubDate'], message: 'article 必须提供 pubDate' });
		}
		if (data.contentType === 'profile' && data.slug !== 'about') {
			context.addIssue({ code: 'custom', path: ['slug'], message: 'profile 的 slug 必须是 about' });
		}
		if (data.contentType === 'answer' && (!data.question || !data.shortAnswer)) {
			context.addIssue({ code: 'custom', path: ['question'], message: 'answer 必须提供 question 与 shortAnswer' });
		}
	});

const profileSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('person'),
		name: z.string(),
		aliases: z.array(z.string()).default([]),
		title: z.string().optional(),
		bio: z.string().optional(),
		stats: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
		knowsAbout: z.array(z.string()).default([]),
		capabilities: z.array(z.object({ title: z.string(), description: z.string() })).default([]),
		timeline: z.array(z.object({ period: z.string(), role: z.string(), description: z.string() })).default([]),
		education: z.string().optional(),
		wechat: z.string().optional(),
		links: z.record(z.string(), z.url()).optional(),
	}),
	z.object({
		kind: z.literal('cooperation'),
		title: z.string(),
		description: z.string(),
		contact: z.string().optional(),
	}),
]);

const projectSchema = z.object({
	title: z.string(),
	description: z.string(),
	slug: z.string().min(1),
	status: z.enum(['active', 'maintained', 'archived', 'planned', 'unknown']).default('unknown'),
	url: z.union([z.string().url(), z.string().startsWith('/')]).optional(),
	repository: z.url().optional(),
	tags: z.array(z.string()).default([]),
	category: z.enum(['project', 'course', 'snippet']).default('project'),
	featured: z.boolean().default(false),
	sortRank: z.number().int().default(100),
	image: z.union([z.string().startsWith('/'), z.url()]).optional(),
	imageAlt: z.string().optional(),
	role: z.string().optional(),
	impact: z.string().optional(),
	proofPoints: z.array(z.string()).default([]),
});

const resumeSchema = z.object({
	title: z.string(),
	description: z.string(),
	contentType: z.literal('profile'),
	slug: z.literal('about'),
	tags: z.array(z.string()).default([]),
	llmSummary: z.string().min(1),
	legacySource: z.string().optional(),
	legacyUrl: z.string().startsWith('/').optional(),
});

const seriesSchema = z.object({
	title: z.string(),
	description: z.string(),
	intro: z.string().optional(),
	faq: z.array(z.object({
		question: z.string(),
		answer: z.string(),
	})).default([]),
	featured: z.array(z.string()).default([]),
});

export const collections = {
	docs: defineCollection({
		loader: glob({
			base: siteConfig.contentRoot,
			pattern: '{articles/**/*.md,answers/**/*.md,pages/**/*.md}',
			generateId: generateDocId,
		}),
		schema: docsSchema({ extend: publicDocFields }),
	}),
	profile: defineCollection({
		loader: glob({ base: siteConfig.contentRoot, pattern: 'profile/*.{yaml,yml}' }),
		schema: profileSchema,
	}),
	resume: defineCollection({
		loader: glob({ base: siteConfig.contentRoot, pattern: 'profile/resume.md' }),
		schema: resumeSchema,
	}),
	projects: defineCollection({
		loader: glob({ base: siteConfig.contentRoot, pattern: 'projects/*.{yaml,yml,json}' }),
		schema: projectSchema,
	}),
	series: defineCollection({
		loader: glob({
			base: path.join(siteConfig.contentRoot, 'series'),
			pattern: '*.{yaml,yml}',
		}),
		schema: seriesSchema,
	}),
};
