import { MediaData, MediaImage, MediaType, SearchResult } from "@/types";
import { get_json, request_json } from "./http";

const BASE = "https://api4.thetvdb.com/v4";
const ARTWORK_BASE = "https://artworks.thetvdb.com";

/**
 * TheTVDB v4 API keys are per-project (not per-user), so a single project key
 * can be bundled with the plugin — the same approach Jellyfin uses. Paste a key
 * registered at https://www.thetvdb.com/api-information here to let users skip
 * the API-key step (they may still need a subscriber PIN). Leave empty to
 * require each user to provide their own key.
 */
export const DEFAULT_THETVDB_API_KEY = "";

interface TVDBArtwork {
	id: number;
	image: string;
	thumbnail?: string;
	type?: number;
	score?: number;
	width?: number;
	height?: number;
	language?: string | null;
}

interface TVDBSeason {
	id: number;
	number: number;
	type?: { id: number; name: string; type: string };
	image?: string;
}

interface TVDBRemoteId {
	id: string;
	sourceName?: string;
}

interface TVDBTranslation {
	language: string;
	name?: string;
	overview?: string;
}

interface TVDBTranslations {
	nameTranslations?: TVDBTranslation[];
	overviewTranslations?: TVDBTranslation[];
}

interface TVDBSearchItem {
	tvdb_id?: string;
	id?: string;
	name: string;
	type?: string;
	year?: string;
	image_url?: string;
	overview?: string;
}

export interface TheTVDBTokenStore {
	token: string;
	expires_at: number;
	save(token: string, expires_at: number): Promise<void>;
}

export class TheTVDBClient {
	constructor(
		private readonly api_key: string,
		private readonly pin: string,
		private readonly tokens: TheTVDBTokenStore,
	) {}

	get configured(): boolean {
		return !!this.api_key;
	}

	async search(query: string, kind: "all" | "movie" | "tv"): Promise<SearchResult[]> {
		const params: Record<string, string | number> = { query, limit: 25 };
		if (kind === "movie") params.type = "movie";
		else if (kind === "tv") params.type = "series";

		const data = await this.get<{ data: TVDBSearchItem[] }>("/search", params);
		return (data.data ?? [])
			.filter(item => kind !== "all" || item.type === "series" || item.type === "movie")
			.map(item => this.to_search_result(item))
			.filter((r): r is SearchResult => r !== null);
	}

	/** `language` is a 3-letter TheTVDB code (e.g. "eng", "spa", "jpn"). */
	async get_details(id: number, media_type: MediaType, language: string): Promise<MediaData> {
		const path = media_type === "movie" ? `/movies/${id}/extended` : `/series/${id}/extended`;
		const r = (await this.get<{ data: Record<string, unknown> }>(path, { meta: "translations" }))
			.data;

		const remote = (r.remoteIds as TVDBRemoteId[] | undefined) ?? [];
		const tmdb = remote.find(x => (x.sourceName ?? "").toLowerCase().includes("moviedb"));
		const artworks = (r.artworks as TVDBArtwork[] | undefined) ?? [];
		const seasons = (r.seasons as TVDBSeason[] | undefined) ?? [];
		const translations = r.translations as TVDBTranslations | undefined;

		// Base name/overview are in the original language; prefer a translation
		// for the requested locale, then English, then the original.
		const original_name = (r.name as string) || "";
		const title = pick_translation(translations?.nameTranslations, language, original_name);
		const overview = pick_translation(
			translations?.overviewTranslations,
			language,
			(r.overview as string) || "",
		);

		const year = typeof r.year === "number" || typeof r.year === "string" ? String(r.year) : "";
		const release_date = (r.firstAired as string) || year;
		const poster = (r.image as string) || best_artwork(artworks, "poster") || "";
		const banner = best_artwork(artworks, "backdrop") || "";

		return {
			type: media_type,
			title,
			original_title: original_name,
			release_date,
			year: release_date ? release_date.split("-")[0] : "",
			overview: clean(overview),
			cover: absolute(poster),
			banner: absolute(banner),
			genres: ((r.genres as { name: string }[] | undefined) ?? []).map(g => g.name),
			rating: "",
			thetvdb_id: id,
			tmdb_id: tmdb ? Number(tmdb.id) || undefined : undefined,
			number_of_seasons: seasons.filter(s => s.type?.type === "official").length || undefined,
		};
	}

	/** Artwork for a specific season number (TheTVDB respects season numbering). */
	async get_season_images(
		series_id: number,
		season_number: number,
		kind: "poster" | "backdrop",
	): Promise<MediaImage[]> {
		const extended = (await this.get<{ data: { seasons?: TVDBSeason[] } }>(
			`/series/${series_id}/extended`,
		)).data;
		const seasons = extended.seasons ?? [];
		// Prefer the official/aired ordering, but accept any matching number.
		const season =
			seasons.find(s => s.type?.type === "official" && s.number === season_number) ??
			seasons.find(s => s.number === season_number);
		if (!season) return [];

		const data = (await this.get<{ data: { artwork?: TVDBArtwork[] } }>(
			`/seasons/${season.id}/extended`,
		)).data;
		return this.to_images(data.artwork ?? [], kind);
	}

	async get_series_images(series_id: number, kind: "poster" | "backdrop"): Promise<MediaImage[]> {
		const data = (await this.get<{ data: { artworks?: TVDBArtwork[] } }>(
			`/series/${series_id}/extended`,
		)).data;
		return this.to_images(data.artworks ?? [], kind);
	}

	async get_movie_images(movie_id: number, kind: "poster" | "backdrop"): Promise<MediaImage[]> {
		const data = (await this.get<{ data: { artworks?: TVDBArtwork[] } }>(
			`/movies/${movie_id}/extended`,
		)).data;
		return this.to_images(data.artworks ?? [], kind);
	}

	private to_search_result(item: TVDBSearchItem): SearchResult | null {
		const id = Number(item.tvdb_id ?? item.id);
		if (!id || isNaN(id)) return null;
		return {
			id,
			media_type: item.type === "movie" ? "movie" : "tv",
			title: item.name,
			release_date: item.year ?? "",
			poster_path: item.image_url ? absolute(item.image_url) : "",
			provider: "thetvdb",
		};
	}

	private to_images(artworks: TVDBArtwork[], kind: "poster" | "backdrop"): MediaImage[] {
		return artworks
			.filter(a => a.image && matches_kind(a, kind))
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
			.map(a => ({
				url: absolute(a.image),
				thumb: absolute(a.thumbnail || a.image),
				width: a.width,
				height: a.height,
				source: a.language ? `TheTVDB · ${a.language}` : "TheTVDB",
				score: a.score,
			}));
	}

	// --- HTTP + auth ---------------------------------------------------------

	private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
		const token = await this.ensure_token();
		return get_json<T>(`${BASE}${path}`, params, { Authorization: `Bearer ${token}` });
	}

	private async ensure_token(): Promise<string> {
		if (this.tokens.token && this.tokens.expires_at > Date.now() + 60_000) return this.tokens.token;

		const body: Record<string, string> = { apikey: this.api_key };
		if (this.pin) body.pin = this.pin;
		const auth = await request_json<{ data?: { token: string } }>({
			url: `${BASE}/login`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const token = auth.data?.token;
		if (!token) throw new Error("TheTVDB authentication failed. Check your API key/PIN.");
		// Tokens are valid ~1 month; refresh well before then.
		await this.tokens.save(token, Date.now() + 24 * 24 * 60 * 60 * 1000);
		return token;
	}
}

/** Choose a translation for the locale, falling back to English then original. */
function pick_translation(
	list: TVDBTranslation[] | undefined,
	language: string,
	fallback: string,
): string {
	if (!list?.length) return fallback;
	const chosen =
		list.find(t => t.language === language) ?? list.find(t => t.language === "eng") ?? list[0];
	return chosen.name || chosen.overview || fallback;
}

/** Classify artwork by aspect ratio: posters are tall, banners/backdrops wide. */
function matches_kind(a: TVDBArtwork, kind: "poster" | "backdrop"): boolean {
	const w = a.width ?? 0;
	const h = a.height ?? 0;
	if (!w || !h) return kind === "poster";
	const ratio = w / h;
	return kind === "poster" ? ratio < 1 : ratio > 1.3;
}

function best_artwork(artworks: TVDBArtwork[], kind: "poster" | "backdrop"): string {
	const match = artworks
		.filter(a => a.image && matches_kind(a, kind))
		.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
	return match?.image ?? "";
}

/** TheTVDB sometimes returns relative artwork paths; make them absolute. */
function absolute(url: string): string {
	if (!url) return "";
	if (url.startsWith("http")) return url;
	return ARTWORK_BASE + (url.startsWith("/") ? url : `/${url}`);
}

function clean(text: string): string {
	return text.replace(/[\r\n]+/g, " ").trim();
}
