import type { App } from "./types";
import { humanizeSlackError } from "../utils/translate";
import { describeEmojiNames, listEmojiNames } from "../utils/emojiNames";
import { type UploadState, imageCache } from "./emojiPrompt";
import { uploadEmoji, createAlias } from "../services/slack-emoji";
import { createPipeline } from "../pipeline";
import { downloadSlackFile } from "../services/file-manager";
import { stateAction, discardPrompt } from "./stateAction";

async function setReaction(
	context: any,
	state: UploadState,
	action: "add" | "remove",
	name: string,
) {
	try {
		await context.client.reactions[action]({
			name,
			channel: state.channelId,
			timestamp: state.messageTs,
		});
	} catch (error) {
		console.log(`Failed to ${action} reaction ${name}: ${error}`);
	}
}

async function say(context: any, state: UploadState, ts: string, text: string) {
	await context.client.chat.update({
		channel: state.channelId,
		ts,
		text,
		blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
	});
}

async function resolveBuffer(state: UploadState): Promise<Buffer> {
	const cached = imageCache.get(state.file.fileId);
	if (cached) {
		imageCache.delete(state.file.fileId);
		return cached;
	}
	return downloadSlackFile(state.file.slackUrl);
}

/** Uploads the emoji plus any aliases, returning the message to show the user. */
async function upload(
	state: UploadState,
	removeBackground: boolean,
	context: any,
): Promise<string> {
	let buffer = await resolveBuffer(state);
	let warning = "";

	if (removeBackground) {
		try {
			const result = await createPipeline({ removeBackground: true }).execute(
				{ buffer, mimeType: state.file.mimeType },
				{ userId: state.userId },
			);
			buffer = result.data.buffer;
			if (result.warnings.length > 0) {
				warning = `\n:warning: ${result.warnings.join("; ")}`;
			}
		} catch (error) {
			warning = `\n:warning: Background removal failed, uploading original: ${error}`;
			console.error(`Background removal failed: ${error}`);
		}
	}

	const [primaryName, ...aliasNames] = state.names;

	const result = await uploadEmoji(primaryName, buffer);
	if (!result.ok) {
		await setReaction(context, state, "remove", "emojbot-working");
		await setReaction(context, state, "add", "emojibot-bad");
		console.log(`Failed to upload emoji ${primaryName}: ${result.error}`);
		return `Failed to add \`:${primaryName}:\`:\n\`\`\`\n${humanizeSlackError(result)}\n\`\`\``;
	}

	console.log(`User ${state.userId} uploaded emoji: ${primaryName}`);

	const aliases = await Promise.all(
		aliasNames.map(async (name) => ({
			name,
			ok: (await createAlias(name, primaryName)).ok,
		})),
	);
	const made = aliases.filter((a) => a.ok).map((a) => a.name);
	const failed = aliases.filter((a) => !a.ok).map((a) => a.name);

	let text = `:${primaryName}: has been added`;
	if (made.length > 0) text += ` with aliases: ${listEmojiNames(made)}`;
	if (failed.length > 0) {
		text += `\n:warning: Failed to create aliases: ${listEmojiNames(failed)}`;
	}
	text += `${warning}\nthanks <@${state.userId}>!`;

	await setReaction(context, state, "remove", "emojbot-working");
	await setReaction(context, state, "add", primaryName);
	return text;
}

/**
 * Registers the three buttons on an upload prompt. Upload and retry are the same
 * operation, so they differ only in the verb shown while work is in flight.
 */
function registerButtons(app: App, prefix: string, verb: string) {
	for (const removeBackground of [false, true]) {
		const actionId = removeBackground ? `${prefix}_remove_bg` : `${prefix}_normal`;
		stateAction(app, actionId, async ({ state, messageTs, context }) => {
			const target = describeEmojiNames(state.names);
			await say(
				context,
				state,
				messageTs,
				removeBackground
					? `Removing background and ${verb} ${target}...`
					: `${verb[0].toUpperCase()}${verb.slice(1)} ${target}...`,
			);
			try {
				await say(
					context,
					state,
					messageTs,
					await upload(state, removeBackground, context),
				);
			} catch (error) {
				await say(context, state, messageTs, `Failed to process: ${error}`);
				await setReaction(context, state, "remove", "emojbot-working");
				await setReaction(context, state, "add", "emojibot-bad");
				console.error(`Error processing ${actionId}: ${error}`);
			}
		});
	}

	stateAction(app, `${prefix}_cancel`, discardPrompt);
}

const uploadActions = async (app: App) => {
	registerButtons(app, "upload", "uploading");
	registerButtons(app, "retry", "re-uploading");
};

export default uploadActions;
