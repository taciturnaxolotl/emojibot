import config from "../config";
import type { ModalView } from "slack-edge";
import type { App } from "./types";
import {
	describeEmojiNames,
	invalidEmojiNames,
	parseEmojiNames,
} from "../utils/emojiNames";
import { type UploadState, promptForEmoji } from "./emojiPrompt";

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
	app: App,
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

			const names = parseEmojiNames(body.message.text ?? "");
			if (names.length === 0 || invalidEmojiNames(names).length > 0) {
				await context.client.views.open({
					trigger_id: payload.trigger_id,
					view: errorView("No usable emoji name found in the message."),
				});
				return;
			}

			const state: UploadState = {
				messageTs: body.message_ts,
				channelId: context.channelId,
				userId: body.user.id,
				file: {
					fileId: file.id ?? "",
					slackUrl: file.url_private,
					mimeType: file.mimetype ?? "image/png",
				},
				names,
			};

			const target = describeEmojiNames(names);

			await promptForEmoji(
				context,
				"retry",
				state,
				state.file.mimeType === "image/gif"
					? `Would you like to retry uploading ${target}?`
					: `How would you like to retry uploading ${target}?`,
			);
		},
	);
};

export default feature2;
