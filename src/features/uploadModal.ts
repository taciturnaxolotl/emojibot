import type { App } from "./types";
import config from "../config";
import {
	emojiNameFromFilename,
	invalidEmojiNames,
	listEmojiNames,
	parseEmojiNames,
} from "../utils/emojiNames";
import { type UploadState, promptForEmoji } from "./emojiPrompt";

/** Message text names the emoji when it has no whitespace; otherwise the filename does. */
function extractEmojiNames(text: string, filename: string): string[] {
	const trimmed = text.trim();
	const names = /\s/.test(trimmed) ? [] : parseEmojiNames(trimmed);
	return names.length > 0 ? names : [emojiNameFromFilename(filename)];
}

const uploadModal = async (app: App) => {
	app.anyMessage(async ({ payload, context }) => {
		if (
			payload.subtype !== "file_share" ||
			payload.channel !== config.channel
		) {
			return;
		}

		const imageFiles = (payload.files ?? []).filter(
			(file) =>
				file.mimetype?.startsWith("image/") && file.id && file.url_private,
		);

		if (imageFiles.length === 0) {
			return;
		}

		const reply = (text: string) =>
			context.client.chat.postMessage({
				channel: payload.channel,
				thread_ts: payload.ts,
				text,
			});

		// For now, only handle single file uploads
		if (imageFiles.length > 1) {
			await reply("Please upload one image at a time.");
			return;
		}

		const file = imageFiles[0];
		const names = extractEmojiNames(payload.text ?? "", file.name ?? "emoji");
		const invalid = invalidEmojiNames(names);

		if (invalid.length > 0) {
			await reply(
				`Can't use ${listEmojiNames(invalid)} as an emoji name. Stick to letters, numbers, \`_\`, \`+\` and \`-\`.`,
			);
			return;
		}

		const state: UploadState = {
			messageTs: payload.ts,
			channelId: payload.channel,
			userId: payload.user,
			file: {
				fileId: file.id!,
				slackUrl: file.url_private!,
				mimeType: file.mimetype ?? "image/png",
			},
			names,
		};

		const [primary, ...aliases] = names;
		const target =
			aliases.length > 0
				? `\`:${primary}:\` aliased as ${listEmojiNames(aliases)}`
				: `\`:${primary}:\``;

		await promptForEmoji(
			context,
			"upload",
			state,
			state.file.mimeType === "image/gif"
				? `Would you like to upload this as ${target}?`
				: `How would you like to upload ${target}?`,
		);
	});
};

export default uploadModal;
