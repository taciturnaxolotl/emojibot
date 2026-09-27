import { SlackApp } from "slack-edge";
import * as features from "./features/index";
import { cleanupOldTempFiles } from "./services/file-manager";
import { cachedAuthorize } from "./services/slack-authorize";
const version = require("../package.json").version;

console.log(
	"----------------------------------\nEmojiBot Server\n----------------------------------\n",
);
console.log(`🚀 Loading EmojiBot v${version}`);

// Check required environment variables
// Note: SLACK_APP_TOKEN is deliberately absent. slack-edge treats its presence
// as a request to run in Socket Mode, which skips request signature
// verification entirely, and we serve Slack over HTTP.
const requiredEnvVars = [
	"SLACK_SIGNING_SECRET",
	"SLACK_BOT_TOKEN",
	"SLACK_BOT_USER_TOKEN",
	"SLACK_COOKIE",
	"SLACK_WORKSPACE",
	"SLACK_CHANNEL",
	"ADMINS",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
	console.error(
		`❌ Missing required environment variables: ${missingEnvVars.join(", ")}`,
	);
	console.error("Please check your .env file or secrets configuration.");
	process.exit(1);
}

console.log("✅ All required environment variables are set");

const app = new SlackApp({
	env: {
		SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET!,
		SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN!,
	},
	authorize: cachedAuthorize(process.env.SLACK_BOT_TOKEN!),
});

console.log("🏗️  Starting EmojiBot...");

console.log(`⚒️  Loading ${Object.entries(features).length} features...`);
for (const [feature, handler] of Object.entries(features)) {
	console.log(`📦 ${feature} loaded`);
	handler(app);
}

// Run cleanup every 30 minutes
setInterval(() => cleanupOldTempFiles(), 30 * 60 * 1000);
// Also run once at startup to clear any existing orphans
cleanupOldTempFiles();

function json(status: number, body: Record<string, unknown>) {
	return new Response(JSON.stringify({ version, ...body }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function health() {
	if (!process.env.SLACK_BOT_TOKEN) {
		return json(503, {
			status: "unhealthy",
			error: "SLACK_BOT_TOKEN not configured",
		});
	}

	try {
		const response = await fetch("https://slack.com/api/auth.test", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
		});
		const data = (await response.json()) as {
			ok: boolean;
			team?: string;
			user?: string;
			error?: string;
		};

		return data.ok
			? json(200, {
					status: "healthy",
					slack: { connected: true, team: data.team, user: data.user },
					uptime: process.uptime(),
				})
			: json(503, {
					status: "unhealthy",
					slack: { connected: false, error: data.error },
				});
	} catch (error) {
		return json(503, {
			status: "unhealthy",
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

export default {
	port: parseInt(process.env.PORT || "3000"),
	async fetch(request: Request) {
		switch (new URL(request.url).pathname) {
			case "/health":
				return health();
			case "/slack":
				return await app.run(request);
			default:
				return new Response("404 Not Found", { status: 404 });
		}
	},
};

console.log(
	"🚀 Server Started in",
	Bun.nanoseconds() / 1000000,
	"milliseconds on version:",
	version + "!",
	"\n\n----------------------------------\n",
);
