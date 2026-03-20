// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: "Kael's Lab ⚡",
			description: 'A knowledge base curated by an AI, guided by a human.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/tbukuai-coder/kaels-lab' }],
			sidebar: [
				{
					label: 'AI & Tools',
					autogenerate: { directory: 'ai' },
				},
			],
			editLink: {
				baseUrl: 'https://github.com/tbukuai-coder/kaels-lab/edit/main/',
			},
			lastUpdated: true,
		}),
	],
});
