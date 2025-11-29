import { SlackApp } from "slack-edge";
import * as features from "./features/index";
const version = require("../package.json").version;

console.log("----------------------------------\nEmojiBot Server\n----------------------------------\n")
console.log(`🚀 Loading EmojiBot v${version}`);

const app = new SlackApp({
    env: {
        SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET!,
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN!,
        SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN!,
    },
});

console.log("🏗️  Starting EmojiBot...");

console.log(`⚒️  Loading ${Object.entries(features).length} features...`);
for (const [feature, handler] of Object.entries(features)) {
    console.log(`📦 ${feature} loaded`);
    handler(app);
}

export default {
    port: parseInt(process.env.PORT || "3000"),
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        switch (path) {
            case "/health":
                try {
                    // Test Slack API authentication
                    const response = await fetch("https://slack.com/api/auth.test", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${process.env.SLACK_BOT_TOKEN}`,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                    });
                    
                    const data = await response.json();
                    
                    if (data.ok) {
                        return new Response(JSON.stringify({
                            status: "healthy",
                            version: version,
                            slack: {
                                connected: true,
                                team: data.team,
                                user: data.user,
                            },
                            uptime: process.uptime(),
                        }), {
                            status: 200,
                            headers: { "Content-Type": "application/json" },
                        });
                    } else {
                        return new Response(JSON.stringify({
                            status: "unhealthy",
                            version: version,
                            slack: {
                                connected: false,
                                error: data.error,
                            },
                        }), {
                            status: 503,
                            headers: { "Content-Type": "application/json" },
                        });
                    }
                } catch (error) {
                    return new Response(JSON.stringify({
                        status: "unhealthy",
                        version: version,
                        error: error.message,
                    }), {
                        status: 503,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            case "/slack":
                return await app.run(request);
            default:
                return new Response("404 Not Found", { status: 404 });
        }
    },
};

console.log("🚀 Server Started in", Bun.nanoseconds() / 1000000, "milliseconds on version:", version + "!", "\n\n----------------------------------\n")