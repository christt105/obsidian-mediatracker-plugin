import { App, PluginSettingTab, Setting } from "obsidian";
import type MediaTrackerPlugin from "@/main";
import { FrontmatterCase, ProviderPreference } from "@/settings";
import { FileSuggest, FolderSuggest } from "@/suggesters";

export class MediaTrackerSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: MediaTrackerPlugin,
	) {
		super(app, plugin);
	}

	private get settings() {
		return this.plugin.settings;
	}

	private save() {
		return this.plugin.saveSettings();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("media-tracker-settings");

		// ----- Note creation -----
		new Setting(containerEl).setName("Note creation").setHeading();

		this.add_folder_setting(containerEl, "Movies folder", "movies_folder");
		this.add_folder_setting(containerEl, "TV shows folder", "tv_folder");
		this.add_folder_setting(containerEl, "Seasons folder", "seasons_folder");
		this.add_folder_setting(containerEl, "Games folder", "games_folder");

		new Setting(containerEl)
			.setName("File name format")
			.setDesc("Available variables: {{title}}, {{year}}, {{release_date}}.")
			.addText(text =>
				text
					.setPlaceholder("{{title}} ({{year}})")
					.setValue(this.settings.file_name_format)
					.onChange(async value => {
						this.settings.file_name_format = value.trim() || "{{title}} ({{year}})";
						await this.save();
					}),
			);

		new Setting(containerEl)
			.setName("Default status")
			.setDesc("Status assigned to newly created entries.")
			.addText(text =>
				text.setValue(this.settings.default_status).onChange(async value => {
					this.settings.default_status = value;
					await this.save();
				}),
			);

		new Setting(containerEl)
			.setName("Open note after creation")
			.addToggle(toggle =>
				toggle.setValue(this.settings.open_note_on_creation).onChange(async value => {
					this.settings.open_note_on_creation = value;
					await this.save();
				}),
			);

		new Setting(containerEl)
			.setName("Overwrite without asking")
			.setDesc("Replace an existing note with the same name instead of prompting.")
			.addToggle(toggle =>
				toggle.setValue(this.settings.overwrite_without_asking).onChange(async value => {
					this.settings.overwrite_without_asking = value;
					await this.save();
				}),
			);

		new Setting(containerEl)
			.setName("Frontmatter property case")
			.addDropdown(dd =>
				dd
					.addOption(FrontmatterCase.snake, "snake_case")
					.addOption(FrontmatterCase.camel, "camelCase")
					.setValue(this.settings.frontmatter_case)
					.onChange(async value => {
						this.settings.frontmatter_case = value as FrontmatterCase;
						await this.save();
					}),
			);

		// ----- Seasons -----
		new Setting(containerEl).setName("Seasons").setHeading();

		new Setting(containerEl)
			.setName("Seasons list property")
			.setDesc("Property on the show note where season links are stored.")
			.addText(text =>
				text.setValue(this.settings.seasons_property).onChange(async value => {
					this.settings.seasons_property = value.trim() || "seasons";
					await this.save();
				}),
			);

		new Setting(containerEl)
			.setName("Season label")
			.setDesc('Word used in season file names, e.g. "Show - Season 1".')
			.addText(text =>
				text.setValue(this.settings.season_label).onChange(async value => {
					this.settings.season_label = value.trim() || "Season";
					await this.save();
				}),
			);

		// ----- Templates -----
		new Setting(containerEl).setName("Templates").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"Optional custom note templates. Leave empty to use the built-in frontmatter. " +
				"Templates support {{variable}} placeholders (e.g. {{title}}, {{overview}}, {{genres}}).",
		});
		this.add_file_setting(containerEl, "Movie template", "template_movie");
		this.add_file_setting(containerEl, "TV show template", "template_tv");
		this.add_file_setting(containerEl, "Season template", "template_season");
		this.add_file_setting(containerEl, "Game template", "template_game");

		// ----- Providers -----
		new Setting(containerEl).setName("Providers").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"Choose which service supplies data and artwork for each kind. " +
				'"Auto" uses TMDB for movies and TheTVDB for shows when both are configured, ' +
				"otherwise whichever key you set. TheTVDB respects season numbering (best for anime).",
		});

		this.add_provider_setting(containerEl, "Movie provider", "movie_provider");
		this.add_provider_setting(containerEl, "TV show provider", "tv_provider");

		// ----- TMDB -----
		new Setting(containerEl).setName("TMDB (movies & TV)").setHeading();
		this.add_link(
			containerEl,
			"Create an account and generate an API key (v3 or v4 token).",
			"https://www.themoviedb.org/settings/api",
		);

		new Setting(containerEl)
			.setName("TMDB API key")
			.addText(text => {
				text.inputEl.type = "password";
				text.setValue(this.settings.tmdb_api_key).onChange(async value => {
					this.settings.tmdb_api_key = value.trim();
					await this.save();
				});
			});

		new Setting(containerEl)
			.setName("Preferred locale")
			.setDesc("Language used when fetching movie/TV data.")
			.addDropdown(dd => {
				dd.addOption("auto", "auto");
				window.moment.locales().forEach(locale => {
					dd.addOption(locale, locale);
				});
				dd.setValue(this.settings.locale_preference).onChange(value => {
					this.settings.locale_preference = value;
					void this.save();
				});
			});

		new Setting(containerEl)
			.setName("Ask preferred locale")
			.setDesc("Prompt for a locale each time before searching.")
			.addToggle(toggle =>
				toggle.setValue(this.settings.ask_preferred_locale).onChange(async value => {
					this.settings.ask_preferred_locale = value;
					await this.save();
				}),
			);

		new Setting(containerEl)
			.setName("Include adult content")
			.addToggle(toggle =>
				toggle.setValue(this.settings.include_adult).onChange(async value => {
					this.settings.include_adult = value;
					await this.save();
				}),
			);

		new Setting(containerEl)
			.setName("Image locales")
			.setDesc(
				"Ordered ISO-639-1 codes for cover/banner choices, e.g. \"es,en\". " +
					"Matching artwork is shown first. Leave empty to use your preferred locale, then English.",
			)
			.addText(text =>
				text
					.setPlaceholder("es,en")
					.setValue(this.settings.image_locales)
					.onChange(async value => {
						this.settings.image_locales = value.trim();
						await this.save();
					}),
			);

		// ----- TheTVDB -----
		new Setting(containerEl).setName("TheTVDB (TV shows & seasons)").setHeading();
		this.add_link(
			containerEl,
			"Register a project to get a v4 API key. Personal keys also need a subscriber PIN.",
			"https://www.thetvdb.com/api-information",
		);

		new Setting(containerEl)
			.setName("TheTVDB API key")
			.setDesc("Leave empty to use the bundled project key, if the plugin ships with one.")
			.addText(text => {
			text.inputEl.type = "password";
			text.setValue(this.settings.thetvdb_api_key).onChange(async value => {
				this.settings.thetvdb_api_key = value.trim();
				this.settings.thetvdb_token = "";
				this.settings.thetvdb_token_expires_at = 0;
				await this.save();
			});
		});

		new Setting(containerEl)
			.setName("TheTVDB subscriber PIN")
			.setDesc("Optional. Required for personal / user-supported API keys.")
			.addText(text => {
				text.inputEl.type = "password";
				text.setValue(this.settings.thetvdb_pin).onChange(async value => {
					this.settings.thetvdb_pin = value.trim();
					this.settings.thetvdb_token = "";
					this.settings.thetvdb_token_expires_at = 0;
					await this.save();
				});
			});

		// ----- IGDB -----
		new Setting(containerEl).setName("IGDB (video games)").setHeading();
		this.add_link(
			containerEl,
			"Register a Twitch application to get a Client ID and Secret.",
			"https://dev.twitch.tv/console/apps",
		);

		new Setting(containerEl).setName("IGDB client ID").addText(text => {
			text.inputEl.type = "password";
			text.setValue(this.settings.igdb_client_id).onChange(async value => {
				this.settings.igdb_client_id = value.trim();
				this.settings.igdb_access_token = "";
				this.settings.igdb_token_expires_at = 0;
				await this.save();
			});
		});

		new Setting(containerEl).setName("IGDB client secret").addText(text => {
			text.inputEl.type = "password";
			text.setValue(this.settings.igdb_client_secret).onChange(async value => {
				this.settings.igdb_client_secret = value.trim();
				this.settings.igdb_access_token = "";
				this.settings.igdb_token_expires_at = 0;
				await this.save();
			});
		});

		new Setting(containerEl)
			.setName("Prefer official Steam artwork")
			.setDesc("Use Steam cover/hero art for games that are on Steam.")
			.addToggle(toggle =>
				toggle.setValue(this.settings.prefer_steam_artwork).onChange(async value => {
					this.settings.prefer_steam_artwork = value;
					await this.save();
				}),
			);

		// ----- SteamGridDB -----
		new Setting(containerEl).setName("SteamGridDB (artwork)").setHeading();
		this.add_link(
			containerEl,
			"Generate an API key from your SteamGridDB preferences.",
			"https://www.steamgriddb.com/profile/preferences/api",
		);

		new Setting(containerEl).setName("SteamGridDB API key").addText(text => {
			text.inputEl.type = "password";
			text.setValue(this.settings.steamgriddb_token).onChange(async value => {
				this.settings.steamgriddb_token = value.trim();
				await this.save();
			});
		});
	}

	private add_provider_setting(
		container: HTMLElement,
		name: string,
		key: "movie_provider" | "tv_provider",
	) {
		new Setting(container).setName(name).addDropdown(dd =>
			dd
				.addOption("auto", "Auto")
				.addOption("tmdb", "TMDB")
				.addOption("thetvdb", "TheTVDB")
				.setValue(this.settings[key])
				.onChange(async value => {
					this.settings[key] = value as ProviderPreference;
					await this.save();
				}),
		);
	}

	private add_folder_setting(
		container: HTMLElement,
		name: string,
		key: "movies_folder" | "tv_folder" | "seasons_folder" | "games_folder",
	) {
		new Setting(container).setName(name).addSearch(cb => {
			cb.setPlaceholder("Example: Media Tracker/...")
				.setValue(this.settings[key])
				.onChange(async value => {
					this.settings[key] = value.trim();
					await this.save();
				});
			new FolderSuggest(this.app, cb.inputEl, async value => {
				this.settings[key] = value;
				await this.save();
			});
		});
	}

	private add_file_setting(
		container: HTMLElement,
		name: string,
		key: "template_movie" | "template_tv" | "template_season" | "template_game",
	) {
		new Setting(container).setName(name).addSearch(cb => {
			cb.setPlaceholder("Example: Templates/Movie.md")
				.setValue(this.settings[key])
				.onChange(async value => {
					this.settings[key] = value.trim();
					await this.save();
				});
			new FileSuggest(this.app, cb.inputEl, async value => {
				this.settings[key] = value;
				await this.save();
			});
		});
	}

	private add_link(container: HTMLElement, text: string, href: string) {
		const p = container.createEl("p", { cls: "setting-item-description" });
		p.createEl("a", { text, href });
	}
}
