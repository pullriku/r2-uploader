import {App, PluginSettingTab, Setting} from "obsidian";
import R2Uploader from "./main";

export interface R2UploaderSettings {
	accessKeyId: string;
	secretKey: string;
	bucket: string;
	endpoint: string;
	baseUrl: string;
	path: string;
}

export const DEFAULT_SETTINGS: R2UploaderSettings = {
	accessKeyId: "",
	secretKey: "",
	bucket: "",
	endpoint: "",
	baseUrl: "",
	path: "",
}

export class SettingTab extends PluginSettingTab {
	plugin: R2Uploader;

	constructor(app: App, plugin: R2Uploader) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "R2 Uploader Settings."});

		new Setting(containerEl)
			.setName("Access Key ID")
			.addText(text => {
				text.setValue(this.plugin.settings.accessKeyId)
					.onChange(async (value) => {
						this.plugin.settings.accessKeyId = value.trim();
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("Secret Key")
			.addText(text => {
				text.setValue(this.plugin.settings.secretKey)
					.onChange(async (value) => {
						this.plugin.settings.secretKey = value.trim();
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("Bucket")
			.addText(text => {
				text.setValue(this.plugin.settings.bucket)
					.onChange(async (value) => {
						this.plugin.settings.bucket = value.trim();
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("Endpoint")
			.addText(text => {
				text.setValue(this.plugin.settings.endpoint)
					.onChange(async (value) => {
						this.plugin.settings.endpoint = value.trim();
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("CDN Base URL")
			.setDesc("example: https://cdn.example.com")
			.addText(text => {
				text
					.setPlaceholder("https://cdn.example.com")
					.setValue(this.plugin.settings.baseUrl)
					.onChange(async (value) => {
						this.plugin.settings.baseUrl = value.trim().replace(/\/+$/, "");
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("Path Template")
			.setDesc("available variables: {year}, {month}, {day}, {uuid}, {filename}, {filenameExt}, {ext}, {mdFilename}, {mdFilenameExt}, {mdParentPath}")
			.addText((text) =>
				text.setValue(this.plugin.settings.path)
					.onChange(async (value) => {
						this.plugin.settings.path = value.trim();
						await this.plugin.saveSettings();
				})
			);
	}
}
