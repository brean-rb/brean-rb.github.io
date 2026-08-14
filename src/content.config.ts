import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
	schema: z.object({
		title: z.string(),
		stack: z.array(z.string()),
		summary: z.string(),
		date: z.date(),
		draft: z.boolean().default(false),
		repoUrl: z.string().url().optional(),
	}),
});

const experience = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/experience' }),
	schema: z.object({
		company: z.string(),
		role: z.string(),
		startDate: z.date(),
		endDate: z.date().optional(),
		location: z.string().optional(),
		description: z.string(),
		draft: z.boolean().default(false),
	}),
});

const certifications = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/certifications' }),
	schema: z.object({
		title: z.string(),
		issuer: z.string(),
		startDate: z.date().optional(),
		endDate: z.date().optional(),
		credentialUrl: z.string().url().optional(),
		status: z.enum(['completed', 'in-progress']).default('in-progress'),
		draft: z.boolean().default(false),
	}),
});

export const collections = { projects, experience, certifications };
