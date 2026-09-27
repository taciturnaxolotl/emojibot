import config from "../config";
import type { App } from "./types";
import { type UploadState, imageCache } from "./emojiPrompt";

/** Handler that receives an already-parsed, already-authorized prompt. */
type StateHandler = (args: {
	state: UploadState;
	messageTs: string;
	context: any;
}) => Promise<void>;

async function isAdmin(app: App, userId: string): Promise<boolean> {
	if (config.admins.includes(userId)) return true;
	try {
		const res = await app.client.users.info({ user: userId });
		return res.user?.is_admin === true;
	} catch (error) {
		console.log(`Failed to check admin status for ${userId}: ${error}`);
		return false; // a flaky lookup must never widen access
	}
}

/**
 * Registers a button whose payload carries an UploadState. The buttons sit in a
 * public channel message, so registering through here is what guarantees only
 * the prompt's owner (or an admin) can act on it.
 */
export function stateAction(app: App, actionId: string, handle: StateHandler) {
	app.action(actionId, async () => {}, async ({ payload, context, body }) => {
		const action = body.actions?.[0] ?? payload;
		const value = "value" in action ? action.value : undefined;
		const messageTs = body.message?.ts;
		if (!value || !messageTs) {
			console.error(`No value or message ts on ${actionId}`);
			return;
		}

		const state: UploadState = JSON.parse(value);
		const clicker = body.user?.id;

		if (clicker !== state.userId && !(await isAdmin(app, clicker))) {
			console.log(`User ${clicker} tried to use ${state.userId}'s ${actionId}`);
			await context.respond?.({
				response_type: "ephemeral",
				replace_original: false,
				text: `Only <@${state.userId}> or an admin can use these buttons.`,
			});
			return;
		}

		await handle({ state, messageTs, context });
	});
}

/** Shared "nvm" behaviour: drop the cached image and delete the prompt. */
export const discardPrompt: StateHandler = async ({
	state,
	messageTs,
	context,
}) => {
	imageCache.delete(state.file.fileId);
	try {
		await context.client.reactions.remove({
			name: "emojbot-working",
			channel: state.channelId,
			timestamp: state.messageTs,
		});
	} catch (error) {
		console.log(`Failed to remove working reaction: ${error}`);
	}
	await context.client.chat.delete({ channel: state.channelId, ts: messageTs });
};
