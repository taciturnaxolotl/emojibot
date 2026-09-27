import type { SlackApp } from "slack-edge";

export type App = SlackApp<{
	SLACK_SIGNING_SECRET: string;
	SLACK_BOT_TOKEN: string;
	SLACK_APP_TOKEN: string;
}>;
