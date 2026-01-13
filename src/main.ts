import {App, Editor, MarkdownView, Modal, Notice, Plugin} from 'obsidian';
import {DEFAULT_SETTINGS, R2UploaderSettings, SettingTab} from "./settings";
import { AwsClient } from "aws4fetch";

export default class R2Uploader extends Plugin {
	settings: R2UploaderSettings;
	private s3?: AwsClient;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("editor-paste", (event, editor) => {
				void this.handlePaste(event, editor);
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-drop", (event, editor) => {
				void this.handleDrop(event, editor);
			})
		);

		// This creates an icon in the left ribbon.
		// this.addRibbonIcon('dice', 'Sample', (evt: MouseEvent) => {
		// 	// Called when the user clicks the icon.
		// 	new Notice('This is a notice!');
		// });

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'open-modal-simple',
		// 	name: 'Open modal (simple)',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	}
		// });

		// This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: 'replace-selected',
		// 	name: 'Replace selected content',
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		editor.replaceSelection('Sample editor command');
		// 	}
		// });

		// This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: 'open-modal-complex',
		// 	name: 'Open modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 		return false;
		// 	}
		// });

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	new Notice("Click");
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<R2UploaderSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.s3 = undefined;
	}

	private getS3(): AwsClient {
		if (this.s3 !== undefined) {
			return this.s3;
		}

		const {
			endpoint, accessKeyId, secretKey
		} = this.settings;
		if (!endpoint || !accessKeyId || !secretKey) {
			throw new Error("R2 settings are missing (endpoint/keys).");
		}

		this.s3 = new AwsClient({
			service: "s3",
			region: "auto",
			accessKeyId,
			secretAccessKey: secretKey,
		});

		return this.s3;
	}

	private async handlePaste(event: ClipboardEvent, editor: Editor) {
		const files = Array.from(event.clipboardData?.files ?? []);
		if (files.length === 0) {
			return;
		}

		event.preventDefault();

		await this.uploadAndInsert(files, editor);
	}

	private async handleDrop(event: DragEvent, editor: Editor) {
		const files = Array.from(event.dataTransfer?.files ?? []);

		if (files === undefined) {
			return;
		}

		event.preventDefault();

		await this.uploadAndInsert(files, editor);
	}

	private async uploadAndInsert(files: File[], editor: Editor) {
		try {
			this.assertReady();

			const links: string[] = [];
			for (const file of files) {
				const { key, url } = await this.uploadFile(file);
				const md = this.toMarkdownLink(url, file.type, file.name);
				links.push("\n\n" + md);
				console.log("[r2-uploader] uploaded:", key);
			}

			editor.replaceSelection(links.join("\n"));
			new Notice(`Uploaded ${files.length} file(s) to R2`);
		} catch (e) {
			console.error(e);
			new Notice(`R2 upload failed: ${(e as Error).message}`);
		}
	}

	private assertReady() {
		const s = this.settings;
		if (!s.bucket) throw new Error("bucket is empty");
		if (!s.baseUrl) throw new Error("baseUrl (CDN) is empty");
		if (!s.path) throw new Error("path template is empty");
	}

	private async uploadFile(file: File): Promise<{ key: string, url: string }> {
		const s3 = this.getS3();
		const bucket = this.settings.bucket;

		const context = this.buildTemplateContext(file);
		const path = renderPath(this.settings.path, context);

		await s3.fetch(`${this.settings.endpoint}/${bucket}/${path}`, {
			method: "PUT",
			headers: new Headers({
				"Content-Type": file.type || "application/octet-stream",
			}),
			// @ts-ignore
			body: await file.arrayBuffer(),
		})

		const url = joinUrl(this.settings.baseUrl, encodeKeyForUrl(path));
		return { key: path, url };
	}

	private buildTemplateContext(file: File): TemplateContext {
		const now = new Date();
		const pad2 = (x: number) => x.toString().padStart(2, "0");

		const uuid = crypto.randomUUID();

		const filenameExtRaw = file.name;
		const extRaw = filenameExtRaw.includes(".") ? filenameExtRaw.split(".").pop() ?? "" : "";
		const filenameRaw = filenameExtRaw.replace(/\.[^.]+$/, "");

		const mdFile = this.app.workspace.getActiveFile();
		const mdFilenameExtRaw = mdFile?.name ?? "";
		const mdFilenameRaw = mdFile?.basename ?? "";
		const mdParentPathRaw = mdFile?.parent?.path ?? "";

		return {
			year: now.getFullYear().toString(),
			month: pad2(now.getMonth() + 1),
			day: pad2(now.getDate()),
			uuid: uuid.toString(),

			filename: safeSeg(filenameRaw),
			filenameExt: safeSeg(filenameExtRaw),
			ext: safeSeg(extRaw),

			mdFilename: safeSeg(mdFilenameRaw),
			mdFilenameExt: safeSeg(mdFilenameExtRaw),
			mdParentPath: safePath(mdParentPathRaw),
		}
	}
	
	private toMarkdownLink(url: string, mime: string, name: string): string {
		const isImage = mime.startsWith("image/") || mime.startsWith("video/");

		return isImage ? `![](${url})` : `[${name}](${url})`;
	}
}

interface TemplateContext {
	year: string,
	month: string,
	day: string,
	uuid: string,

	filename: string,
	filenameExt: string,
	ext: string,

	mdFilename: string,
	mdFilenameExt: string,
	mdParentPath: string,

	[key: string]: string,
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

function safeSeg(filename: string): string {
	return (filename ?? "")
		.replace(/[\/\\?%*:|"<>#\u0000-\u001F]/g, "-")
		.replace(/\s+/g, " ")
		.trim();
}

function safePath(p: string): string {
	// mdParentPath 用：/ は区切りとして残す
	return (p ?? "")
		.split("/")
		.filter(Boolean)
		.map(safeSeg)
		.join("/");
}

function renderPath(template: string, ctx: TemplateContext): string {
	const out = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => ctx[k] ?? "")

	// 先頭と末尾のスラッシュを削除
	return out.replace(/^\/+/, "").replace(/\/+$/, "")
}

function joinUrl(base: string, path: string): string {
	return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function encodeKeyForUrl(key: string): string {
  // "/"は残してセグメントだけURLエンコード
	return key.split("/").map(encodeURIComponent).join("/");
}
