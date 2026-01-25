import { randomUUIDv7 } from "bun";
import { $ } from "bun";
import config from "../config";

interface EmojiResult {
    ok: boolean;
    error?: string;
}

export async function uploadEmoji(name: string, buffer: Buffer): Promise<EmojiResult> {
    const form = new FormData();
    form.append("token", process.env.SLACK_BOT_USER_TOKEN ?? "");
    form.append("mode", "data");
    form.append("name", name);

    const randomUUID = randomUUIDv7();
    const tempPath = `tmp/${randomUUID}.png`;
    await Bun.write(tempPath, buffer);
    const blob = Bun.file(tempPath);

    form.append("image", blob);

    const res = await fetch(
        `https://${config.slackWorkspace}.slack.com/api/emoji.add`,
        {
            credentials: "include",
            method: "POST",
            body: form,
            headers: {
                Cookie: process.env.SLACK_COOKIE!,
            },
        }
    ).then((res) => res.json() as Promise<EmojiResult>);

    await $`rm ${tempPath}`;

    return res;
}

export async function createAlias(aliasName: string, targetName: string): Promise<EmojiResult> {
    const form = new FormData();
    form.append("token", process.env.SLACK_BOT_USER_TOKEN ?? "");
    form.append("mode", "alias");
    form.append("name", aliasName);
    form.append("alias_for", targetName);

    const res = await fetch(
        `https://${config.slackWorkspace}.slack.com/api/emoji.add`,
        {
            credentials: "include",
            method: "POST",
            body: form,
            headers: {
                Cookie: process.env.SLACK_COOKIE!,
            },
        }
    ).then((res) => res.json() as Promise<EmojiResult>);

    return res;
}
