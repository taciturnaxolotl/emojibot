import { SlackAPIClient } from "slack-web-api-client";
import type { Authorize, AuthorizeResult } from "slack-edge";

async function lookup(botToken: string): Promise<AuthorizeResult> {
	const client = new SlackAPIClient(botToken);
	const res = await client.auth.test();
	return {
		botToken,
		enterpriseId: res.enterprise_id,
		teamId: res.team_id,
		team: res.team,
		url: res.url,
		botId: res.bot_id!,
		botUserId: res.user_id!,
		userId: res.user_id,
		user: res.user,
		botScopes: (res.headers.get("x-oauth-scopes") ?? "").split(","),
	};
}

/**
 * slack-edge's default authorize spends a Slack round trip on auth.test before
 * every handler runs, and Slack only allows three seconds to acknowledge an
 * interaction. A bot token's identity never changes, so resolve it once.
 */
export function cachedAuthorize(botToken: string): Authorize {
	let identity: Promise<AuthorizeResult> | undefined;
	const resolve = () =>
		(identity ??= lookup(botToken).catch((error) => {
			identity = undefined; // let the next request retry a transient failure
			throw error;
		}));
	resolve();
	return resolve;
}
