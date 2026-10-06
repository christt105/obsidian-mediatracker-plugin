import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			'obsidianmd/ui/sentence-case': [
				'error',
				{
					brands: [
						'Obsidian',
						'Bases',
						'Media Tracker',
						'TheTVDB',
						'Steam',
						'SteamGridDB',
						'Open Library',
						'YouTube',
					],
					acronyms: ['API', 'ID', 'PIN', 'TV', 'TMDB', 'IGDB', 'URL', 'OK'],
					ignoreWords: ['Enter', 'camelCase'],
					ignoreRegex: ['^snake_case$', '^[a-z]{2}(,[a-z]{2})*$'],
				},
			],
		},
	},
);
