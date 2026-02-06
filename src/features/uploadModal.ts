import type { SlackApp } from "slack-edge";
import config from "../config";
import { downloadSlackFile } from "../services/file-manager";

// Cache for pre-downloaded images
export const imageCache = new Map<string, Buffer>();

export interface UploadState {
	messageTs: string;
	channelId: string;
	userId: string;
	file: {
		fileId: string;
		slackUrl: string;
		suggestedName: string;
		mimeType: string;
	};
	emojiName: string;
}

function extractEmojiName(text: string, filename: string): string {
	// If text looks like an emoji name (no spaces, not empty)
	const trimmed = text.trim();
	if (trimmed && !trimmed.includes(" ") && !trimmed.includes("\n")) {
		// Take the first name if there are commas
		const firstName = trimmed
			.split(",")[0]
			.replace(/:/g, "")
			.trim()
			.toLowerCase();
		if (firstName) {
			return firstName;
		}
	}

	// Fall back to filename without extension
	const baseName = filename.replace(/\.[^/.]+$/, "");
	return baseName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

const uploadModal = async (
	app: SlackApp<{
		SLACK_SIGNING_SECRET: string;
		SLACK_BOT_TOKEN: string;
		SLACK_APP_TOKEN: string;
	}>,
) => {
	app.anyMessage(async ({ payload, context }) => {
		if (
			payload.subtype !== "file_share" ||
			payload.channel !== config.channel
		) {
			return;
		}

		if (!payload.files || payload.files.length === 0) {
			return;
		}

		// Filter to only image files with required properties
		const imageFiles = payload.files.filter(
			(file) =>
				file.mimetype?.startsWith("image/") && file.id && file.url_private,
		);

		if (imageFiles.length === 0) {
			return;
		}

		// For now, only handle single file uploads
		if (imageFiles.length > 1) {
			await context.client.chat.postMessage({
				channel: payload.channel,
				thread_ts: payload.ts,
				text: "Please upload one image at a time.",
			});
			return;
		}

		const file = imageFiles[0];
		const emojiName = extractEmojiName(
			payload.text ?? "",
			file.name ?? "emoji",
		);

		// Validate emoji name
		if (!emojiName || emojiName.includes(" ") || emojiName.includes("\n")) {
			await context.client.chat.postMessage({
				channel: payload.channel,
				thread_ts: payload.ts,
				text: "Please include an emoji name in your message (no spaces).",
			});
			return;
		}

		const state: UploadState = {
			messageTs: payload.ts,
			channelId: payload.channel,
			userId: payload.user,
			file: {
				fileId: file.id!,
				slackUrl: file.url_private!,
				suggestedName: emojiName,
				mimeType: file.mimetype ?? "image/png",
			},
			emojiName,
		};

		// Build action buttons
		const isGif = state.file.mimeType === "image/gif";
		const actionButtons: any[] = [
			{
				type: "button",
				text: {
					type: "plain_text",
					text: "as is",
				},
				style: "primary",
				action_id: "upload_normal",
				value: JSON.stringify(state),
			},
		];

		if (!isGif) {
			actionButtons.push({
				type: "button",
				text: {
					type: "plain_text",
					text: "remove bg",
				},
				action_id: "upload_remove_bg",
				value: JSON.stringify(state),
			});
		}

		actionButtons.push({
			type: "button",
			text: {
				type: "plain_text",
				text: "nvm",
			},
			style: "danger",
			action_id: "upload_cancel",
			value: JSON.stringify(state),
		});

		// Add working reaction first
		try {
			await context.client.reactions.add({
				name: "emojbot-working",
				channel: payload.channel,
				timestamp: payload.ts,
			});
		} catch (error) {
			console.log(`Failed to add working reaction: ${error}`);
		}

		// Post thread message asking how to upload
		const promptText = isGif
			? `Would you like to upload this as \`:${emojiName}:\`?`
			: `How would you like to upload \`:${emojiName}:\`?`;

		await context.client.chat.postMessage({
			channel: payload.channel,
			thread_ts: payload.ts,
			text: promptText,
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: promptText,
					},
				},
				{
					type: "actions",
					elements: actionButtons,
				},
			],
		});

		// Start downloading image in background
		downloadSlackFile(state.file.slackUrl)
			.then((buffer) => {
				imageCache.set(state.file.fileId, buffer);
			})
			.catch((error) => {
				console.log(`Failed to pre-download image: ${error}`);
			});
	});
};

export default uploadModal;
