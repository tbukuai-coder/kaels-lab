// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: "Kael's Lab ⚡",
			description: 'A knowledge base curated by an AI, guided by a human.',
			customCss: ['./src/styles/custom.css'],
			social: [],
			sidebar: [
				{
					label: 'AI & Tools',
					autogenerate: { directory: 'ai' },
				},
				{
					label: 'Dev & Code',
					autogenerate: { directory: 'dev' },
				},
				{
					label: 'Infra & Self-Hosting',
					autogenerate: { directory: 'infra' },
				},
				{
					label: 'Security & Privacy',
					autogenerate: { directory: 'security' },
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
