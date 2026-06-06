import { Notice, Plugin, TFile } from "obsidian";

import { MediaData, MediaImage, MediaType, Provider, SearchResult } from "@/types";
import {
	DEFAULT_SETTINGS,
	MediaTrackerSettings,
	folder_for,
	template_for,
} from "@/settings";
import { MediaTrackerSettingTab } from "@/settings_tab";
import { TMDBClient } from "@/apis/tmdb";
import { DEFAULT_THETVDB_API_KEY, TheTVDBClient } from "@/apis/thetvdb";
import { IGDBClient } from "@/apis/igdb";
import { search_steam } from "@/apis/steam";
import { SteamGridDBClient } from "@/apis/steamgriddb";
import { render_note, substitute_variables } from "@/render";
import { choose, choose_image, choose_result, confirm, prompt } from "@/modals";
import { MEDIA_VIEWS_BASE } from "@/base";

/** Note frontmatter is untyped; we treat values as `unknown` and narrow them. */
type Frontmatter = Record<string, unknown>;

export default class MediaTrackerPlugin extends Plugin {
	settings: MediaTrackerSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "add-movie-or-tv",
			name: "Add movie or TV show",
			callback: () => this.run(() => this.add_movie_or_tv()),
		});
		this.addCommand({
			id: "add-game",
			name: "Add video game",
			callback: () => this.run(() => this.add_game()),
		});
		this.addCommand({
			id: "create-season",
			name: "Create season (from active show note)",
			callback: () => this.run(() => this.create_season()),
		});
		this.addCommand({
			id: "search-steam-id",
			name: "Search Steam App ID (for active note)",
			callback: () => this.run(() => this.search_steam_id()),
		});
		this.addCommand({
			id: "update-images",
			name: "Update images (cover / banner)",
			callback: () => this.run(() => this.update_images()),
		});
		this.addCommand({
			id: "create-views-base",
			name: "Create media views (Bases gallery & table)",
			callback: () => this.run(() => this.create_views_base()),
		});

		this.addRibbonIcon("clapperboard", "Add movie or TV show", () =>
			this.run(() => this.add_movie_or_tv()),
		);
		this.addRibbonIcon("gamepad-2", "Add video game", () => this.run(() => this.add_game()));

		this.addSettingTab(new MediaTrackerSettingTab(this.app, this));
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<MediaTrackerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Run an action, surfacing any error as a notice instead of crashing. */
	private async run(action: () => Promise<void>) {
		try {
			await action();
		} catch (error) {
			console.error("Media Tracker:", error);
			new Notice(`Media Tracker: ${(error as Error).message}`);
		}
	}

	// --- API client factories ------------------------------------------------

	private tmdb(): TMDBClient {
		if (!this.settings.tmdb_api_key) throw new Error("Set your TMDB API key in the settings.");
		return new TMDBClient(this.settings.tmdb_api_key, this.settings.include_adult);
	}

	/** The TheTVDB key, falling back to the bundled project key. */
	private thetvdb_api_key(): string {
		return this.settings.thetvdb_api_key || DEFAULT_THETVDB_API_KEY;
	}

	private thetvdb(): TheTVDBClient {
		const key = this.thetvdb_api_key();
		if (!key) throw new Error("Set your TheTVDB API key in the settings.");
		return new TheTVDBClient(key, this.settings.thetvdb_pin, {
			token: this.settings.thetvdb_token,
			expires_at: this.settings.thetvdb_token_expires_at,
			save: async (token, expires_at) => {
				this.settings.thetvdb_token = token;
				this.settings.thetvdb_token_expires_at = expires_at;
				await this.saveSettings();
			},
		});
	}

	private provider_configured(provider: Provider): boolean {
		return provider === "tmdb" ? !!this.settings.tmdb_api_key : !!this.thetvdb_api_key();
	}

	/**
	 * Pick the provider for a media kind from the user's preference, falling back
	 * to whichever is configured. Throws if neither TMDB nor TheTVDB is set up.
	 */
	private resolve_provider(kind: "movie" | "tv"): Provider {
		const preference = kind === "movie" ? this.settings.movie_provider : this.settings.tv_provider;
		// "auto": movies favour TMDB, TV favours TheTVDB (it respects seasons).
		let provider: Provider = preference === "auto" ? (kind === "movie" ? "tmdb" : "thetvdb") : preference;
		if (!this.provider_configured(provider)) {
			const other: Provider = provider === "tmdb" ? "thetvdb" : "tmdb";
			if (this.provider_configured(other)) return other;
			throw new Error("Set a TMDB or TheTVDB API key in the settings.");
		}
		return provider;
	}

	private igdb(): IGDBClient {
		if (!this.settings.igdb_client_id || !this.settings.igdb_client_secret) {
			throw new Error("Set your IGDB client ID and secret in the settings.");
		}
		return new IGDBClient(
			this.settings.igdb_client_id,
			this.settings.igdb_client_secret,
			{
				token: this.settings.igdb_access_token,
				expires_at: this.settings.igdb_token_expires_at,
				save: async (token, expires_at) => {
					this.settings.igdb_access_token = token;
					this.settings.igdb_token_expires_at = expires_at;
					await this.saveSettings();
				},
			},
			this.settings.prefer_steam_artwork,
		);
	}

	private steamgriddb(): SteamGridDBClient {
		if (!this.settings.steamgriddb_token) {
			throw new Error("Set your SteamGridDB API key in the settings.");
		}
		return new SteamGridDBClient(this.settings.steamgriddb_token);
	}

	// --- Commands -------------------------------------------------------------

	private async add_movie_or_tv() {
		const movie_provider = this.resolve_provider("movie");
		const tv_provider = this.resolve_provider("tv");

		const query = await prompt(this.app, "Search movie or TV show");
		if (!query) return;

		const language = await this.resolve_language();
		const results = await this.search_titles(query, movie_provider, tv_provider, language);
		if (!results.length) {
			new Notice(`No results for "${query}".`);
			return;
		}
		const selected = await choose_result(this.app, results);
		if (!selected) return;

		const media = await this.fetch_details(selected, language);
		await this.create_note(media);
	}

	/**
	 * Search for titles. When movies and TV use the same provider a single
	 * search covers both; otherwise each provider is queried for its kind and
	 * the results are merged into one chooser.
	 */
	private async search_titles(
		query: string,
		movie_provider: Provider,
		tv_provider: Provider,
		language: string,
	): Promise<SearchResult[]> {
		if (movie_provider === tv_provider) {
			return this.provider_search(movie_provider, query, "all", language);
		}
		const [movies, shows] = await Promise.all([
			this.provider_search(movie_provider, query, "movie", language).catch(report_empty),
			this.provider_search(tv_provider, query, "tv", language).catch(report_empty),
		]);
		return [...movies, ...shows];
	}

	private async provider_search(
		provider: Provider,
		query: string,
		kind: "all" | "movie" | "tv",
		language: string,
	): Promise<SearchResult[]> {
		if (provider === "tmdb") {
			const results = await this.tmdb().search(query, language);
			const filtered = kind === "all" ? results : results.filter(r => r.media_type === kind);
			return filtered.map(r => ({ ...r, provider: "tmdb" as const }));
		}
		return this.thetvdb().search(query, kind, this.tvdb_language());
	}

	private async fetch_details(selected: SearchResult, language: string): Promise<MediaData> {
		if (selected.provider === "thetvdb") {
			return this.thetvdb().get_details(selected.id, selected.media_type, this.tvdb_language());
		}
		const media = await this.tmdb().get_details(selected.id, selected.media_type, language);
		// Cross-reference the TheTVDB id so season artwork can use either provider.
		if (selected.media_type === "tv") {
			try {
				media.thetvdb_id = await this.tmdb().get_tvdb_id(selected.id);
			} catch (error) {
				console.warn("Media Tracker: could not fetch TheTVDB id", error);
			}
		}
		return media;
	}

	private async add_game() {
		const igdb = this.igdb();
		const query = await prompt(this.app, "Search video game");
		if (!query) return;

		const results = await igdb.search(query);
		if (!results.length) {
			new Notice(`No results for "${query}".`);
			return;
		}
		const selected = await choose_result(this.app, results);
		if (!selected) return;

		const media = igdb.to_media_data(selected);
		await this.create_note(media);
	}

	private async create_season() {
		const file = this.active_markdown_file();
		const fm = this.frontmatter_of(file);
		if (!fm || fm.type !== "tv") {
			new Notice("Open a TV show note (type: tv) to create a season.");
			return;
		}

		const number_input = await prompt(this.app, "Season number");
		if (!number_input) return;
		const season_number = parseInt(number_input, 10);
		if (isNaN(season_number)) {
			new Notice("Season number must be a number.");
			return;
		}

		const parent_title: string = (fm.title as string) || file.basename;
		const tmdb_id = fm.tmdb_id as number | undefined;
		const thetvdb_id = fm.thetvdb_id as number | undefined;

		const media: MediaData = {
			type: "season",
			title: `${parent_title} - ${this.settings.season_label} ${season_number}`,
			original_title: "",
			release_date: "",
			year: "",
			overview: "",
			cover: (fm.cover as string | undefined) ?? "",
			banner: (fm.banner as string | undefined) ?? "",
			genres: [],
			rating: "",
			season_number,
			series_file: file.basename,
		};

		// Enrich the season cover. TheTVDB respects season numbering, so prefer it
		// when available; otherwise use TMDB (which also gives the air date).
		const prefer_tvdb =
			!!thetvdb_id && !!this.settings.thetvdb_api_key && this.settings.tv_provider !== "tmdb";
		try {
			if (prefer_tvdb && thetvdb_id) {
				const images = await this.thetvdb().get_season_images(thetvdb_id, season_number, "poster");
				if (images.length) media.cover = images[0].url;
			} else if (tmdb_id && this.settings.tmdb_api_key) {
				const language = await this.resolve_language();
				const season = await this.tmdb().get_season(tmdb_id, season_number, language);
				if (season.air_date) media.release_date = season.air_date;
				if (season.poster_path) {
					media.cover = `https://image.tmdb.org/t/p/original${season.poster_path}`;
				}
			}
		} catch (error) {
			console.warn("Media Tracker: could not fetch season details", error);
		}

		const new_file = await this.create_note(media);
		if (new_file) await this.link_season_to_parent(file, new_file);
	}

	private async search_steam_id() {
		const file = this.active_markdown_file();
		const fm = this.frontmatter_of(file);
		const default_query: string = (fm?.title as string) || file.basename;

		const query = await prompt(this.app, "Search game on Steam", default_query);
		if (!query) return;

		const items = await search_steam(query);
		if (!items.length) {
			new Notice("No games found on Steam.");
			return;
		}
		const selected = await choose(
			this.app,
			items,
			item => `${item.name} (App ID: ${item.id})`,
			"Select the Steam app",
		);
		if (!selected) return;

		await this.app.fileManager.processFrontMatter(file, (frontmatter: Frontmatter) => {
			frontmatter.steam_appid = selected.id;
		});
		new Notice(`Steam App ID ${selected.id} saved.`);
	}

	private async update_images() {
		const file = this.active_markdown_file();
		const fm = this.frontmatter_of(file);
		const type = fm?.type as MediaType | undefined;
		if (!type) {
			new Notice("This note has no 'type' property.");
			return;
		}

		const kind = await choose(
			this.app,
			["poster", "backdrop"] as const,
			k => (k === "poster" ? "Cover (poster)" : "Banner (backdrop)"),
			"What to update",
		);
		if (!kind) return;

		const images =
			type === "videogame"
				? await this.fetch_game_images(file, fm, kind)
				: await this.fetch_av_images(file, fm, type, kind);
		if (!images || !images.length) return;

		const selected = await choose_image(this.app, images);
		if (!selected) return;

		const property = kind === "poster" ? "cover" : "banner";
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Frontmatter) => {
			frontmatter[property] = selected.url;
			if (selected.steam_appid) frontmatter.steam_appid = selected.steam_appid;
			if (selected.steamgriddb_id) frontmatter.steamgriddb_id = selected.steamgriddb_id;
		});
		new Notice(`Updated ${property}.`);
	}

	private async create_views_base() {
		// Place the base alongside the media folders (their common parent).
		const movies = this.settings.movies_folder;
		const parent = movies.includes("/") ? movies.split("/").slice(0, -1).join("/") : "";
		const path = parent ? `${parent}/Media Tracker Views.base` : "Media Tracker Views.base";

		await this.ensure_folder(parent);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			const overwrite = await confirm(this.app, `"${path}" already exists. Overwrite it?`);
			if (!overwrite) {
				await this.open_note(existing);
				return;
			}
			await this.app.vault.modify(existing, MEDIA_VIEWS_BASE);
			await this.open_note(existing);
			new Notice("Media views updated.");
			return;
		}

		const file = await this.app.vault.create(path, MEDIA_VIEWS_BASE);
		await this.open_note(file);
		new Notice("Created media views base.");
	}

	// --- Image helpers --------------------------------------------------------

	/**
	 * Fetch movie / TV / season artwork. Uses the preferred provider for the
	 * media kind and falls back to the other when an id or season is missing
	 * there. Ids are read from the note, or the parent show for seasons.
	 */
	private async fetch_av_images(
		file: TFile,
		fm: Frontmatter | undefined,
		type: MediaType,
		kind: "poster" | "backdrop",
	): Promise<MediaImage[] | null> {
		const season_number = Number(fm?.season_number) || undefined;
		let tmdb_id = fm?.tmdb_id as number | undefined;
		let thetvdb_id = fm?.thetvdb_id as number | undefined;

		// Seasons carry no ids of their own — resolve them from the parent show.
		if (type === "season") {
			const parent = this.resolve_first_link(fm?.series, file);
			if (!parent) {
				new Notice("Couldn't find the parent show. The season's 'series' property must link to it.");
				return null;
			}
			const pfm = this.frontmatter_of(parent);
			tmdb_id = tmdb_id ?? (pfm?.tmdb_id as number | undefined);
			thetvdb_id = thetvdb_id ?? (pfm?.thetvdb_id as number | undefined);
		}
		if (!tmdb_id && !thetvdb_id) {
			new Notice("No 'tmdb_id' or 'thetvdb_id' found on this note (or its parent show).");
			return null;
		}

		// Gather artwork from both providers so the picker shows every option,
		// with the preferred provider's images listed first.
		const kind_pref = type === "movie" ? "movie" : "tv";
		const preferred = this.resolve_provider(kind_pref);
		const order: Provider[] = preferred === "thetvdb" ? ["thetvdb", "tmdb"] : ["tmdb", "thetvdb"];

		const images: MediaImage[] = [];
		for (const provider of order) {
			try {
				if (provider === "tmdb" && tmdb_id && this.settings.tmdb_api_key) {
					images.push(...(await this.tmdb_av_images(tmdb_id, type, kind, season_number)));
				} else if (provider === "thetvdb" && thetvdb_id && this.thetvdb_api_key()) {
					images.push(...(await this.thetvdb_av_images(thetvdb_id, type, kind, season_number)));
				}
			} catch (error) {
				console.warn(`Media Tracker: ${provider} images failed`, error);
			}
		}
		if (!images.length) {
			new Notice("No images found.");
			return null;
		}
		return images;
	}

	private async tmdb_av_images(
		id: number,
		type: MediaType,
		kind: "poster" | "backdrop",
		season_number?: number,
	): Promise<MediaImage[]> {
		const tmdb = this.tmdb();
		const languages = this.image_languages();
		if (type !== "season") return tmdb.get_images(id, type, kind, languages);

		// TMDB has season posters only (no backdrops) and 404s for missing
		// seasons, so fall back to the show's artwork.
		let images: MediaImage[] = [];
		if (kind === "poster" && season_number) {
			try {
				images = await tmdb.get_images(id, "season", "poster", languages, season_number);
			} catch (error) {
				console.warn("Media Tracker: TMDB season images unavailable, using show", error);
			}
		}
		if (!images.length) images = await tmdb.get_images(id, "tv", kind, languages);
		return images;
	}

	private async thetvdb_av_images(
		id: number,
		type: MediaType,
		kind: "poster" | "backdrop",
		season_number?: number,
	): Promise<MediaImage[]> {
		const client = this.thetvdb();
		if (type === "movie") return client.get_movie_images(id, kind);
		if (type === "season" && season_number) {
			const images = await client.get_season_images(id, season_number, kind);
			if (images.length) return images;
		}
		return client.get_series_images(id, kind);
	}

	/** Map the preferred locale to a 3-letter TheTVDB language code. */
	private tvdb_language(): string {
		let locale = this.settings.locale_preference;
		if (!locale || locale === "auto") locale = window.moment.locale() || "en";
		const two = locale.split("-")[0].toLowerCase();
		return TVDB_LANGUAGES[two] ?? "eng";
	}

	/** Ordered ISO-639-1 codes for sorting image choices. */
	private image_languages(): string[] {
		const configured = this.settings.image_locales
			.split(",")
			.map(s => s.trim())
			.filter(Boolean);
		if (configured.length) return configured;

		const languages: string[] = [];
		const preferred = this.settings.locale_preference;
		if (preferred && preferred !== "auto") languages.push(preferred.split("-")[0]);
		if (!languages.includes("en")) languages.push("en");
		return languages;
	}

	private async fetch_game_images(
		file: TFile,
		fm: Frontmatter | undefined,
		kind: "poster" | "backdrop",
	): Promise<MediaImage[] | null> {
		const sgdb = this.steamgriddb();
		let sgdb_id = fm?.steamgriddb_id as number | undefined;
		const raw_appid = fm?.steam_appid as string | number | undefined;
		const steam_appid = raw_appid != null && raw_appid !== "" ? String(raw_appid) : undefined;

		// Resolve the SteamGridDB game id from a Steam app id when missing.
		if (steam_appid && !sgdb_id) {
			const game = await sgdb.game_by_steam_appid(steam_appid);
			if (game) sgdb_id = game.id;
		}

		// Otherwise ask the user to find the game on SteamGridDB.
		if (!sgdb_id) {
			const query = await prompt(
				this.app,
				"Search game on SteamGridDB",
				(fm?.title as string) || file.basename,
			);
			if (!query) return null;
			const games = await sgdb.autocomplete(query);
			if (!games.length) {
				new Notice("No games found on SteamGridDB.");
				return null;
			}
			const game = await choose(this.app, games, g => g.name, "Select the game");
			if (!game) return null;
			sgdb_id = game.id;
		}

		const images = await sgdb.images(sgdb_id, kind, steam_appid);
		if (!images.length) new Notice("No images found.");
		return images;
	}

	// --- Note writing ---------------------------------------------------------

	private async create_note(media: MediaData): Promise<TFile | null> {
		const template_path = template_for(this.settings, media.type);
		let template_contents: string | undefined;
		if (template_path) {
			const template_file = this.app.vault.getAbstractFileByPath(template_path);
			if (template_file instanceof TFile) {
				template_contents = await this.app.vault.read(template_file);
			} else {
				new Notice(`Template not found: ${template_path}. Using default frontmatter.`);
			}
		}

		const contents = render_note(media, this.settings, template_contents);
		const folder = folder_for(this.settings, media.type);
		const file_name = this.build_file_name(media);
		const path = folder ? `${folder}/${file_name}` : file_name;

		await this.ensure_folder(folder);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			const overwrite =
				this.settings.overwrite_without_asking ||
				(await confirm(this.app, `"${file_name}" already exists. Overwrite it?`));
			if (!overwrite) {
				await this.open_note(existing);
				return existing;
			}
			await this.app.fileManager.trashFile(existing);
		}

		const file = await this.app.vault.create(path, contents);
		await this.open_note(file);
		new Notice(`Created ${file_name}`);
		return file;
	}

	private build_file_name(media: MediaData): string {
		const raw = substitute_variables(this.settings.file_name_format, media).trim();
		const name = raw.replace(/\(\s*\)/g, "").trim() || media.title;
		return sanitize_file_name(name) + ".md";
	}

	private async ensure_folder(folder: string) {
		if (!folder) return;
		if (!this.app.vault.getAbstractFileByPath(folder)) {
			try {
				await this.app.vault.createFolder(folder);
			} catch (error) {
				console.warn("Media Tracker: could not create folder", error);
			}
		}
	}

	private async link_season_to_parent(parent: TFile, season: TFile) {
		const property = this.settings.seasons_property;
		const link = `[[${season.basename}]]`;
		await this.app.fileManager.processFrontMatter(parent, (fm: Frontmatter) => {
			const current = fm[property];
			const list: string[] = Array.isArray(current)
				? (current as string[])
				: current != null && current !== ""
					? [current as string]
					: [];
			if (!list.includes(link)) list.push(link);
			fm[property] = list;
		});
	}

	private async open_note(file: TFile) {
		if (!this.settings.open_note_on_creation) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file, { state: { mode: "source" } });
	}

	// --- Misc helpers ---------------------------------------------------------

	private active_markdown_file(): TFile {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") throw new Error("Open a markdown note first.");
		return file;
	}

	private frontmatter_of(file: TFile): Frontmatter | undefined {
		// Obsidian types `frontmatter` as `any`; expose it with `unknown` values.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		return this.app.metadataCache.getFileCache(file)?.frontmatter as Frontmatter | undefined;
	}

	/**
	 * Resolve a frontmatter link value to a file. Accepts a string or a list
	 * (uses the first entry), with or without `[[...]]` wrapping and `|` aliases.
	 */
	private resolve_first_link(value: unknown, source: TFile): TFile | null {
		const raw: unknown = Array.isArray(value) ? value[0] : value;
		if (typeof raw !== "string") return null;
		const path = raw
			.replace(/^\[\[/, "")
			.replace(/\]\]$/, "")
			.split("|")[0]
			.split("#")[0]
			.trim();
		if (!path) return null;
		return this.app.metadataCache.getFirstLinkpathDest(path, source.path);
	}

	private async resolve_language(): Promise<string> {
		if (this.settings.ask_preferred_locale) {
			const locales = ["auto", ...window.moment.locales()];
			const chosen = await choose(this.app, locales, l => l, "Preferred locale");
			if (chosen) return chosen === "auto" ? "" : chosen;
		}
		return this.settings.locale_preference === "auto" ? "" : this.settings.locale_preference;
	}
}

function sanitize_file_name(name: string): string {
	return name.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();
}

/** Log a failed provider search and continue with no results. */
function report_empty(error: unknown): SearchResult[] {
	console.warn("Media Tracker: search failed for one provider", error);
	return [];
}

/** ISO-639-1 (2-letter) → TheTVDB 3-letter language codes for common locales. */
const TVDB_LANGUAGES: Record<string, string> = {
	en: "eng",
	es: "spa",
	ca: "cat",
	pt: "por",
	fr: "fra",
	de: "deu",
	it: "ita",
	nl: "nld",
	ja: "jpn",
	ko: "kor",
	zh: "zho",
	ru: "rus",
	pl: "pol",
	sv: "swe",
	da: "dan",
	fi: "fin",
	no: "nor",
	cs: "ces",
	el: "ell",
	he: "heb",
	hu: "hun",
	tr: "tur",
	ar: "ara",
	hi: "hin",
	th: "tha",
	uk: "ukr",
	ro: "ron",
};
