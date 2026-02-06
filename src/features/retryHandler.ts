import config from "../config";
import { SlackApp } from "slack-edge";
import { humanizeSlackError } from "../utils/translate";
import { $ } from "bun";

import type { SlackApp } from "slack-edge";
import config from "../config";
import { humanizeSlackError } from "../utils/translate";
import { type UploadState, imageCache } from "./uploadModal";
import { uploadEmoji, createAlias } from "../services/slack-emoji";
import { createPipeline } from "../pipeline";
import { downloadSlackFile } from "../services/file-manager";

async function removeWorkingReaction(context: any, state: UploadState) {
	try {
		await context.client.reactions.remove({
			name: "emojbot-working",
			channel: state.channelId,
			timestamp: state.messageTs,
		});
	} catch (error) {
		console.log(`Failed to remove working reaction: ${error}`);
	}
}

async function addBadReaction(context: any, state: UploadState) {
	try {
		await context.client.reactions.add({
			name: "emojibot-bad",
			channel: state.channelId,
			timestamp: state.messageTs,
		});
	} catch (error) {
		console.log(`Failed to add bad reaction: ${error}`);
	}
}

async function reuploadEmoji(
	state: UploadState,
	removeBackground: boolean = false,
	app: SlackApp<any>,
	context: any,
) {
	// Use cached image if available, otherwise download
	let buffer = imageCache.get(state.file.fileId);
	if (buffer) {
		imageCache.delete(state.file.fileId);
	} else {
		buffer = await downloadSlackFile(state.file.slackUrl);
	}
	let warning = "";

	// Run through pipeline if background removal requested
	if (removeBackground) {
		try {
			const pipeline = createPipeline({ removeBackground: true });
			const pipelineResult = await pipeline.execute(
				{ buffer, mimeType: state.file.mimeType },
				{ userId: state.userId },
			);
			buffer = pipelineResult.data.buffer;
			if (pipelineResult.warnings.length > 0) {
				warning = `\n:warning: ${pipelineResult.warnings.join("; ")}`;
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			warning = `\n:warning: Background removal failed, uploading original: ${errorMessage}`;
			console.error(`Background removal failed: ${errorMessage}`);
		}
	}

	// Parse names for aliases
	const names = state.emojiName
		.split(",")
		.map((name: string) => name.replace(/:/g, "").trim().toLowerCase())
		.filter((name: string) => name.length > 0);

	const primaryName = names[0];
	const aliasNames = names.slice(1);

	// Upload the emoji
	const uploadResult = await uploadEmoji(primaryName, buffer);

	if (!uploadResult.ok) {
		const errorText = `Failed to add \`:${primaryName}:\`:\n\`\`\`\n${humanizeSlackError(uploadResult)}\n\`\`\``;
		// Remove working reaction and add bad reaction
		await removeWorkingReaction(context, state);
		await addBadReaction(context, state);
		console.log(`Failed to upload emoji ${primaryName}: ${uploadResult.error}`);
		return errorText;
	}

	console.log(`User ${state.userId} uploaded emoji: ${primaryName}`);

	// Create aliases
	const successfulAliases: string[] = [];
	const failedAliases: string[] = [];

	for (const aliasName of aliasNames) {
		const aliasResult = await createAlias(aliasName, primaryName);
		if (aliasResult.ok) {
			successfulAliases.push(aliasName);
			console.log(`Created alias ${aliasName} -> ${primaryName}`);
		} else {
			failedAliases.push(aliasName);
			console.log(`Failed to create alias ${aliasName}: ${aliasResult.error}`);
		}
	}

	// Build success message
	let successText = `:${primaryName}: has been added`;

	if (successfulAliases.length > 0) {
		successText += ` with aliases: ${successfulAliases.map((a) => `\`:${a}:\``).join(", ")}`;
	}

	if (failedAliases.length > 0) {
		successText += `\n:warning: Failed to create aliases: ${failedAliases.map((a) => `\`:${a}:\``).join(", ")}`;
	}

	successText += warning;
	successText += `\nthanks <@${state.userId}>!`;

	// Remove working reaction and add the new emoji as reaction
	await removeWorkingReaction(context, state);
	try {
		await app.client.reactions.add({
			name: primaryName,
			channel: state.channelId,
			timestamp: state.messageTs,
		});
	} catch (error) {
		console.log(`Failed to add reaction for ${primaryName}: ${error}`);
	}

	return successText;
}

const feature3 = async (
	app: SlackApp<{
		SLACK_SIGNING_SECRET: string;
		SLACK_BOT_TOKEN: string;
		SLACK_APP_TOKEN: string;
	}>,
) => {
	// Handle normal retry
	app.action(
		"retry_normal",
		async () => {},
		async ({ payload, context, body }) => {
			await handleRetry(app, payload, context, body, false);
		},
	);

	// Handle retry with background removal
	app.action(
		"retry_remove_bg",
		async () => {},
		async ({ payload, context, body }) => {
			await handleRetry(app, payload, context, body, true);
		},
	);

	// Handle cancel - delete the message and clean up
	app.action(
		"retry_cancel",
		async () => {},
		async ({ payload, context, body }) => {
			const value = payload.value ?? body.actions?.[0]?.value;
			if (!value) return;

			const state: UploadState = JSON.parse(value);
			const messageTs = body.message?.ts;

			// Clean up cached image
			imageCache.delete(state.file.fileId);

			// Remove working reaction
			await removeWorkingReaction(context, state);

			// Delete the prompt message
			await context.client.chat.delete({
				channel: state.channelId,
				ts: messageTs,
			});
		},
	);
};

async function handleRetry(
	app: SlackApp<any>,
	payload: any,
	context: any,
	body: any,
	removeBackground: boolean,
) {
	const value = payload.value ?? body.actions?.[0]?.value;
	if (!value) {
		console.error("No value in retry button payload");
		return;
	}

	const state: UploadState = JSON.parse(value);
	const messageTs = body.message?.ts;

	// Update message to show processing
	const processingText = removeBackground
		? `Removing background and re-uploading \`:${state.emojiName}:\`...`
		: `Re-uploading \`:${state.emojiName}:\`...`;

	await context.client.chat.update({
		channel: state.channelId,
		ts: messageTs,
		text: processingText,
		blocks: [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: processingText,
				},
			},
		],
	});

	try {
		const status = await reuploadEmoji(state, removeBackground, app, context);
		await context.client.chat.update({
			channel: state.channelId,
			ts: messageTs,
			text: status,
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: status,
					},
				},
			],
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		const errorText = `Failed to process retry: ${errorMessage}`;

		await context.client.chat.update({
			channel: state.channelId,
			ts: messageTs,
			text: errorText,
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: errorText,
					},
				},
			],
		});

		// Remove working reaction and add bad reaction
		await removeWorkingReaction(context, state);
		await addBadReaction(context, state);

		console.error(`Error processing retry: ${errorMessage}`);
	}
}

export default feature3;
