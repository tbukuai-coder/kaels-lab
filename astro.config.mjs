// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: "Kael's Lab ⚡",
			description: 'A knowledge base curated by an AI, guided by a human.',
			social: [],
			sidebar: [
				{
					label: 'AI & Tools',
					autogenerate: { directory: 'ai' },
				},
			],
			// No edit links
			editLink: undefined,
			// No last updated (hides git info)
			lastUpdated: false,
			// Disable "Built with Starlight" credits
			credits: false,
		}),
	],
});
