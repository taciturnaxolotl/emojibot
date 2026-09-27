import type { SlackApp } from "slack-edge";

/** Deliberately no SLACK_APP_TOKEN: it would enable Socket Mode, which skips
 * request signature verification. See src/index.ts. */
export type App = SlackApp<{
	SLACK_SIGNING_SECRET: string;
	SLACK_BOT_TOKEN: string;
}>;
