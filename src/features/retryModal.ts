import config from "../config";
import { ModalView, SlackApp } from "slack-edge";
import { downloadSlackFile } from "../services/file-manager";
import { type UploadState, imageCache } from "./uploadModal";

function errorView(reason: string): ModalView {
	return {
		type: "modal",
		title: {
			type: "plain_text",
			text: "Error",
			emoji: true,
		},
		close: {
			type: "plain_text",
			text: "Okay",
			emoji: true,
		},
		blocks: [
			{
				type: "context",
				elements: [
					{
						type: "plain_text",
						text: reason,
						emoji: true,
					},
				],
			},
		],
	};
}

const feature2 = async (
	app: SlackApp<{
		SLACK_SIGNING_SECRET: string;
		SLACK_BOT_TOKEN: string;
		SLACK_APP_TOKEN: string;
	}>,
) => {
	app.shortcut(
		"retry_emoji",
		async () => {},
		async ({ context, payload, body }) => {
			if (context.channelId !== config.channel) {
				await context.client.views.open({
					trigger_id: payload.trigger_id,
					view: errorView(
						"This channel doesn't have any emojis managed by emojibot.",
					),
				});
				return;
			}

			// check if the user is a workspace admin
			const isAdmin = await app.client.users
				.info({
					user: body.user.id,
				})
				.then((res) => res.user?.is_admin);

			if (
				body.user.id !== body.message.user &&
				!config.admins.includes(body.user.id) &&
				!isAdmin
			) {
				await context.client.views.open({
					trigger_id: payload.trigger_id,
					view: errorView(
						"Only the OP or authorized admins can retry emojis added with emojibot.",
					),
				});
				return;
			}

			if (!body.message.files || body.message.files.length === 0) {
				await context.client.views.open({
					trigger_id: payload.trigger_id,
					view: errorView("No file found in the message."),
				});
				return;
			}

			const file = body.message.files[0];
			if (!file.url_private) {
				await context.client.views.open({
					trigger_id: payload.trigger_id,
					view: errorView("File URL not found."),
				});
				return;
			}

			const emojiName =
				body.message.text?.startsWith(":") && body.message.text?.endsWith(":")
					? body.message.text.slice(1, -1)
					: body.message.text ?? "emoji";

			const state: UploadState = {
				messageTs: body.message_ts,
				channelId: context.channelId,
				userId: body.user.id,
				file: {
					fileId: file.id ?? "",
					slackUrl: file.url_private,
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
					action_id: "retry_normal",
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
					action_id: "retry_remove_bg",
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
				action_id: "retry_cancel",
				value: JSON.stringify(state),
			});

			// Add working reaction
			try {
				await context.client.reactions.add({
					name: "emojbot-working",
					channel: context.channelId,
					timestamp: body.message_ts,
				});
			} catch (error) {
				console.log(`Failed to add working reaction: ${error}`);
			}

			// Build prompt text
			const promptText = isGif
				? `Would you like to retry uploading \`:${emojiName}:\`?`
				: `How would you like to retry uploading \`:${emojiName}:\`?`;

			// Post thread message asking how to retry
			await context.client.chat.postMessage({
				channel: context.channelId,
				thread_ts: body.message_ts,
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
		},
	);
};

export default feature2;
