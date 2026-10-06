import { stringifyYaml } from "obsidian";
import { MediaData } from "@/types";
import { FrontmatterCase, MediaTrackerSettings } from "@/settings";

/**
 * Build the note body for a media entry. When a template file is provided its
 * contents are used with `{{variable}}` substitution; otherwise a sensible
 * default frontmatter block (matching the Media Tracker template) is generated.
 */
export function render_note(
	media: MediaData,
	settings: MediaTrackerSettings,
	template_contents?: string,
): string {
	if (template_contents && template_contents.trim()) {
		return substitute_variables(template_contents, media);
	}
	const fm = default_frontmatter(media, settings);
	return `---\n${stringifyYaml(fm)}---\n`;
}

/** Generate the default frontmatter object for the given media type. */
export function default_frontmatter(
	media: MediaData,
	settings: MediaTrackerSettings,
): Record<string, unknown> {
	const status = settings.default_status;
	// A shared leading block keeps property order consistent across every type.
	const common = {
		date: "",
		rewatches: [],
		release_date: media.release_date,
		status,
		cover: media.cover,
		banner: media.banner,
		rating: "",
	};
	let fm: Record<string, unknown>;

	if (media.type === "videogame") {
		fm = {
			title: media.title,
			type: "videogame",
			...common,
			genres: media.genres,
			developer: media.developer ?? "",
			// `platforms` is left for you to record where you played it.
			platforms: [],
			available_platforms: media.available_platforms ?? [],
			igdb_id: media.igdb_id,
			steam_appid: media.steam_appid ?? "",
			...(media.steamgriddb_id ? { steamgriddb_id: media.steamgriddb_id } : {}),
			tags: [],
			related: [],
			overview: media.overview,
		};
	} else if (media.type === "book") {
		fm = {
			title: media.title,
			type: "book",
			date: "",
			rewatches: [],
			release_date: media.release_date,
			status,
			cover: media.cover,
			rating: "",
			genres: media.genres,
			author: media.author ?? "",
			...(media.authors && media.authors.length > 1 ? { authors: media.authors } : {}),
			...(media.page_count ? { page_count: media.page_count } : {}),
			publisher: media.publisher ?? "",
			...(media.openlibrary_id ? { openlibrary_id: media.openlibrary_id } : {}),
			...(media.isbn ? { isbn: media.isbn } : {}),
			tags: [],
			related: [],
			overview: media.overview,
		};
	} else if (media.type === "season") {
		fm = {
			title: media.title,
			type: "season",
			series: media.series_file ? `[[${media.series_file}]]` : "",
			season_number: media.season_number,
			...common,
			tags: [],
		};
	} else {
		// movie or tv
		fm = {
			title: media.title,
			type: media.type,
			...common,
			genres: media.genres,
			...(media.tmdb_id ? { tmdb_id: media.tmdb_id } : {}),
			...(media.thetvdb_id ? { thetvdb_id: media.thetvdb_id } : {}),
			...(media.type === "tv" ? { [settings.seasons_property]: [] } : {}),
			tags: [],
			related: [],
			overview: media.overview,
		};
	}

	return settings.frontmatter_case === FrontmatterCase.camel ? to_camel_keys(fm) : fm;
}

/** Replace `{{variable}}` tokens with media values. Arrays become comma lists. */
export function substitute_variables(template: string, media: MediaData): string {
	return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => {
		const value = (media as Record<string, unknown>)[key];
		if (value === undefined || value === null) return "";
		if (Array.isArray(value)) return value.join(", ");
		if (typeof value === "object") return JSON.stringify(value);
		// eslint-disable-next-line @typescript-eslint/no-base-to-string -- arrays and objects are handled above, so only primitives reach here.
		return String(value);
	});
}

function to_camel_keys(obj: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const camel = key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
		out[camel] = value;
	}
	return out;
}
