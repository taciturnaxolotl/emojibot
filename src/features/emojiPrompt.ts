import { downloadSlackFile } from "../services/file-manager";

/** Images pre-fetched while the user decides, keyed by Slack file id. */
export const imageCache = new Map<string, Buffer>();

export interface UploadState {
	messageTs: string;
	channelId: string;
	userId: string;
	file: {
		fileId: string;
		slackUrl: string;
		mimeType: string;
	};
	/** [primary, ...aliases] */
	names: string[];
}

/**
 * Posts the prompt that carries the upload buttons, marks the source message as
 * working, and warms the image cache while the user decides. Upload and retry
 * differ only in their action prefix and question.
 */
export async function promptForEmoji(
	context: any,
	prefix: "upload" | "retry",
	state: UploadState,
	question: string,
) {
	const value = JSON.stringify(state);
	const button = (text: string, action: string, style?: string) => ({
		type: "button",
		text: { type: "plain_text", text },
		...(style ? { style } : {}),
		action_id: `${prefix}_${action}`,
		value,
	});

	const buttons = [button("as is", "normal", "primary")];
	if (state.file.mimeType !== "image/gif") {
		buttons.push(button("remove bg", "remove_bg"));
	}
	buttons.push(button("nvm", "cancel", "danger"));

	try {
		await context.client.reactions.add({
			name: "emojbot-working",
			channel: state.channelId,
			timestamp: state.messageTs,
		});
	} catch (error) {
		console.log(`Failed to add working reaction: ${error}`);
	}

	await context.client.chat.postMessage({
		channel: state.channelId,
		thread_ts: state.messageTs,
		text: question,
		blocks: [
			{ type: "section", text: { type: "mrkdwn", text: question } },
			{ type: "actions", elements: buttons },
		],
	});

	downloadSlackFile(state.file.slackUrl)
		.then((buffer) => imageCache.set(state.file.fileId, buffer))
		.catch((error) => console.log(`Failed to pre-download image: ${error}`));
}
