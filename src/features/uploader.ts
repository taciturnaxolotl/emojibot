import type { SlackApp } from "slack-edge";
import { $, randomUUIDv7 } from "bun";
import config from "../config";
import { humanizeSlackError } from "../utils/translate";

const feature1 = async (
    app: SlackApp<{
        SLACK_SIGNING_SECRET: string;
        SLACK_BOT_TOKEN: string;
        SLACK_APP_TOKEN: string;
    }>
) => {
    app.anyMessage(async ({ payload, context }) => {
        if (
            payload.subtype !== "file_share" ||
            payload.channel !== config.channel
        ) {
            // only listen for payloads in #emojibot that have a file attached
            return;
        }
        if (!payload.files || payload.files.length === 0) {
            context.client.chat.postEphemeral({
                text: "Please attach an image to your message",
                channel: payload.channel,
                user: payload.user,
            });
            return;
        }
        if (payload.files.length > 1) {
            context.client.chat.postEphemeral({
                channel: payload.channel,
                user: payload.user,
                text: "Please only send one emoji at a time",
            });
            return;
        }
        if (payload.text.length > 100) {
            context.client.chat.postEphemeral({
                text: "Please keep your name under 100 characters",
                channel: payload.channel,
                user: payload.user,
            });
            return;
        }
        if (
            payload.text.trim().includes(" ") ||
            payload.text.trim().includes("\n") ||
            payload.text.trim() === ""
        ) {
            return;
        }

        const names = payload.text
            .split(",")
            .map((name) => name.replace(/:/g, "").trim().toLowerCase());
        const primaryName = names[0];
        const aliases = names.slice(1);

        const form = new FormData();
        form.append("token", process.env.SLACK_BOT_USER_TOKEN ?? "");
        form.append("mode", "data");
        form.append("name", primaryName);

        const imgBuffer = await fetch(payload.files[0].url_private, {
            headers: {
                Cookie: process.env.SLACK_COOKIE ?? "",
            },
        }).then((res) => res.blob());

        const randomUUID = randomUUIDv7();
        await Bun.write(`tmp/${randomUUID}.png`, imgBuffer);
        const blob = Bun.file(`tmp/${randomUUID}.png`);

        form.append("image", blob);

        const res = await fetch(
            `https://${config.slackWorkspace}.slack.com/api/emoji.add`,
            {
                credentials: "include",
                method: "POST",
                body: form,
                headers: {
                    Cookie: `Cookie ${process.env.SLACK_COOKIE}`,
                },
            }
        ).then((res) => res.json() as Promise<{ ok: boolean; error?: string }>);

        await $`rm tmp/${randomUUID}.png`;

        console.log(
            res.ok
                ? `💾 User ${payload.user} added the ${primaryName} emoji`
                : `💥 User ${payload.user} failed to add the ${primaryName} emoji: ${res.error}`
        );

        const successfulAliases: string[] = [];
        const failedAliases: string[] = [];

        if (res.ok && aliases.length > 0) {
            for (const alias of aliases) {
                const aliasForm = new FormData();
                aliasForm.append(
                    "token",
                    process.env.SLACK_BOT_USER_TOKEN ?? ""
                );
                aliasForm.append("mode", "alias");
                aliasForm.append("name", alias);
                aliasForm.append("alias_for", primaryName);

                try {
                    const aliasRes = await fetch(
                        `https://${config.slackWorkspace}.slack.com/api/emoji.add`,
                        {
                            credentials: "include",
                            method: "POST",
                            body: aliasForm,
                            headers: {
                                Cookie: `Cookie ${process.env.SLACK_COOKIE}`,
                            },
                        }
                    ).then(
                        (res) =>
                            res.json() as Promise<{
                                ok: boolean;
                                error?: string;
                            }>
                    );

                    if (aliasRes.ok) {
                        successfulAliases.push(alias);
                        console.log(
                            `💾 Added alias ${alias} for ${primaryName}`
                        );
                    } else {
                        failedAliases.push(alias);
                        console.log(
                            `⚠️ Failed to add alias ${alias}: ${aliasRes.error}`
                        );
                    }
                } catch (err) {
                    failedAliases.push(alias);
                    console.log(`💥 Error adding alias ${alias}: ${err}`);
                }
            }
        }

        let replyText = res.ok
            ? `:${primaryName}: has been added`
            : `Failed to add emoji:\n\`\`\`\n${humanizeSlackError(
                  res
              )}\n\`\`\``;

        if (res.ok) {
            if (successfulAliases.length > 0) {
                replyText += ` with aliases: ${successfulAliases
                    .map((a) => `\`:${a}:\``)
                    .join(", ")}`;
            }
            if (failedAliases.length > 0) {
                replyText += `\n⚠️ Failed to create aliases: ${failedAliases
                    .map((alias) => `\`:${alias}:\``)
                    .join(", ")}`;
            }
            replyText += `\nthanks <@${payload.user}>!`;
        }

        context.say({
            text: replyText,
            thread_ts: payload.ts,
        });

        if (res.ok) {
            try {
                await app.client.reactions.add({
                    name: primaryName,
                    channel: payload.channel,
                    timestamp: payload.ts,
                });
            } catch (error) {
                console.log(`Failed to add reaction: ${error}`);
            }
        }
    });
};

export default feature1;
