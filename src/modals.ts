import { App, ButtonComponent, Modal, Notice, SuggestModal, TextComponent } from "obsidian";
import { MediaImage, SearchResult } from "@/types";

/** Prompt for a single line of text. Resolves to null when cancelled. */
export class PromptModal extends Modal {
	private value: string;
	private resolved = false;

	constructor(
		app: App,
		private title: string,
		private initial: string,
		private resolve: (value: string | null) => void,
	) {
		super(app);
		this.value = initial;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.title });

		const input = new TextComponent(contentEl);
		input.setValue(this.initial).setPlaceholder("Type and press Enter");
		input.inputEl.addClass("media-tracker-prompt-input");
		input.inputEl.focus();
		input.inputEl.select();
		input.onChange(v => (this.value = v));
		input.inputEl.addEventListener("keydown", e => {
			if (e.key === "Enter" && !e.isComposing) {
				e.preventDefault();
				this.submit();
			}
		});

		new Setting_buttons(contentEl, () => this.submit(), () => this.close());
	}

	private submit() {
		this.resolved = true;
		this.resolve(this.value.trim() ? this.value.trim() : null);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) this.resolve(null);
	}
}

/** A small helper that adds an OK/Cancel button row. */
class Setting_buttons {
	constructor(container: HTMLElement, onOk: () => void, onCancel: () => void) {
		const row = container.createDiv({ cls: "media-tracker-button-row" });
		new ButtonComponent(row).setButtonText("Cancel").onClick(onCancel);
		new ButtonComponent(row).setButtonText("OK").setCta().onClick(onOk);
	}
}

/** Yes/No confirmation. */
export class ConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private message: string,
		private resolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message });
		const row = contentEl.createDiv({ cls: "media-tracker-button-row" });
		new ButtonComponent(row).setButtonText("No").onClick(() => {
			this.resolved = true;
			this.resolve(false);
			this.close();
		});
		new ButtonComponent(row)
			.setButtonText("Yes")
			.setCta()
			.onClick(() => {
				this.resolved = true;
				this.resolve(true);
				this.close();
			});
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) this.resolve(false);
	}
}

/** Pick one entry from search results, with poster thumbnails. */
export class ResultSuggestModal extends SuggestModal<SearchResult> {
	private resolved = false;

	constructor(
		app: App,
		private results: SearchResult[],
		private resolve: (result: SearchResult | null) => void,
	) {
		super(app);
		this.setPlaceholder("Select an entry");
	}

	getSuggestions(query: string): SearchResult[] {
		const q = query.toLowerCase();
		return this.results.filter(
			r =>
				r.title.toLowerCase().includes(q) ||
				(r.original_title?.toLowerCase().includes(q) ?? false) ||
				(r.release_date?.includes(q) ?? false),
		);
	}

	renderSuggestion(result: SearchResult, el: HTMLElement) {
		el.addClass("media-tracker-suggestion");
		if (result.poster_path) {
			el.createEl("img", {
				cls: "media-tracker-suggestion-img",
				attr: { src: result.poster_path, alt: result.title },
			});
		}
		const info = el.createDiv({ cls: "media-tracker-suggestion-info" });
		info.createDiv({ cls: "media-tracker-suggestion-title", text: result.title });

		const year = result.release_date ? result.release_date.split("-")[0] : "—";
		const type = result.media_type.toUpperCase();
		const subtitle =
			result.original_title && result.original_title !== result.title
				? `${type} · ${result.original_title} (${year})`
				: `${type} · ${year}`;
		info.createEl("small", { text: subtitle });
	}

	onChooseSuggestion(result: SearchResult) {
		this.resolved = true;
		this.resolve(result);
	}

	onClose() {
		super.onClose();
		// Obsidian can fire onClose (e.g. from a click-triggered blur) before
		// onChooseSuggestion finishes running for that same click. Defer the
		// "nothing chosen" fallback one tick so a same-gesture choice wins.
		setTimeout(() => {
			if (!this.resolved) this.resolve(null);
		}, 0);
	}
}

/** Pick one entry from a list of arbitrary labelled items. */
export class ChoiceModal<T> extends SuggestModal<T> {
	private resolved = false;

	constructor(
		app: App,
		private items: readonly T[],
		private to_label: (item: T) => string,
		private resolve: (item: T | null) => void,
		placeholder = "Select",
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getSuggestions(query: string): T[] {
		const q = query.toLowerCase();
		return this.items.filter(i => this.to_label(i).toLowerCase().includes(q));
	}

	renderSuggestion(item: T, el: HTMLElement) {
		el.setText(this.to_label(item));
	}

	onChooseSuggestion(item: T) {
		this.resolved = true;
		this.resolve(item);
	}

	onClose() {
		super.onClose();
		// See ResultSuggestModal.onClose for why this is deferred.
		setTimeout(() => {
			if (!this.resolved) this.resolve(null);
		}, 0);
	}
}

/** Paged grid for choosing artwork. */
export class ImagePickerModal extends SuggestModal<MediaImage | NavItem> {
	private resolved = false;
	private page = 0;
	private readonly page_size = 6;

	constructor(
		app: App,
		private images: MediaImage[],
		private resolve: (image: MediaImage | null) => void,
	) {
		super(app);
		this.setPlaceholder("Choose an image");
	}

	getSuggestions(): (MediaImage | NavItem)[] {
		const start = this.page * this.page_size;
		const items: (MediaImage | NavItem)[] = this.images.slice(start, start + this.page_size);
		if (this.page > 0) items.push({ nav: "prev", label: "⬅ Previous page" });
		if (start + this.page_size < this.images.length) items.push({ nav: "next", label: "Next page ➡" });
		return items;
	}

	renderSuggestion(item: MediaImage | NavItem, el: HTMLElement) {
		if (is_nav(item)) {
			el.addClass("media-tracker-nav-item");
			el.setText(item.label);
			return;
		}
		el.addClass("media-tracker-image-item");
		el.createEl("img", { cls: "media-tracker-image-thumb", attr: { src: item.thumb } });
		const meta = el.createDiv({ cls: "media-tracker-image-meta" });
		meta.createDiv({ text: item.source });
		if (item.width && item.height) {
			meta.createEl("small", { text: `${item.width}×${item.height}` });
		}
	}

	onChooseSuggestion(item: MediaImage | NavItem, evt: MouseEvent | KeyboardEvent) {
		if (is_nav(item)) {
			// Re-open on a different page instead of closing.
			evt.preventDefault();
			this.page += item.nav === "next" ? 1 : -1;
			this.resolved = true; // prevent onClose from resolving null
			this.close();
			const next = new ImagePickerModal(this.app, this.images, this.resolve);
			next.page = this.page;
			next.open();
			return;
		}
		this.resolved = true;
		this.resolve(item);
	}

	onClose() {
		super.onClose();
		// See ResultSuggestModal.onClose for why this is deferred.
		setTimeout(() => {
			if (!this.resolved) this.resolve(null);
		}, 0);
	}
}

interface NavItem {
	nav: "prev" | "next";
	label: string;
}

function is_nav(item: MediaImage | NavItem): item is NavItem {
	return (item as NavItem).nav !== undefined;
}

// --- Promise wrappers -------------------------------------------------------

export function prompt(app: App, title: string, initial = ""): Promise<string | null> {
	return new Promise(resolve => new PromptModal(app, title, initial, resolve).open());
}

export function confirm(app: App, message: string): Promise<boolean> {
	return new Promise(resolve => new ConfirmModal(app, message, resolve).open());
}

export function choose_result(app: App, results: SearchResult[]): Promise<SearchResult | null> {
	if (results.length === 1) return Promise.resolve(results[0]);
	return new Promise(resolve => new ResultSuggestModal(app, results, resolve).open());
}

export function choose<T>(
	app: App,
	items: readonly T[],
	to_label: (item: T) => string,
	placeholder?: string,
): Promise<T | null> {
	return new Promise(resolve => new ChoiceModal(app, items, to_label, resolve, placeholder).open());
}

export function choose_image(app: App, images: MediaImage[]): Promise<MediaImage | null> {
	if (!images.length) {
		new Notice("No images found.");
		return Promise.resolve(null);
	}
	return new Promise(resolve => new ImagePickerModal(app, images, resolve).open());
}
