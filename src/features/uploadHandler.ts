import type { SlackApp } from "slack-edge";
import { downloadSlackFile } from "../services/file-manager";
import { uploadEmoji, createAlias } from "../services/slack-emoji";
import { createPipeline } from "../pipeline";
import { humanizeSlackError } from "../utils/translate";
import type { UploadState } from "./uploadModal";

const uploadHandler = async (
    app: SlackApp<{
        SLACK_SIGNING_SECRET: string;
        SLACK_BOT_TOKEN: string;
        SLACK_APP_TOKEN: string;
    }>
) => {
    // Handle normal upload
    app.action(
        "upload_normal",
        async () => {},
        async ({ payload, context, body }) => {
            await handleUpload(app, payload, context, body, false);
        }
    );

    // Handle upload with background removal
    app.action(
        "upload_remove_bg",
        async () => {},
        async ({ payload, context, body }) => {
            await handleUpload(app, payload, context, body, true);
        }
    );
};

async function handleUpload(
    app: SlackApp<any>,
    payload: any,
    context: any,
    body: any,
    removeBackground: boolean
) {
    const value = payload.value ?? body.actions?.[0]?.value;
    if (!value) {
        console.error("No value in upload button payload");
        return;
    }

    const state: UploadState = JSON.parse(value);
    const messageTs = body.message?.ts;

    // Update message to show processing
    const processingText = removeBackground
        ? `Removing background and uploading \`:${state.emojiName}:\`...`
        : `Uploading \`:${state.emojiName}:\`...`;

    await context.client.chat.update({
        channel: state.channelId,
        ts: messageTs,
        text: processingText,
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: processingText,
                },
            },
        ],
    });

    try {
        // Download the file
        let buffer = await downloadSlackFile(state.file.slackUrl);
        let warning = "";

        // Run through pipeline if background removal requested
        if (removeBackground) {
            try {
                const pipeline = createPipeline({ removeBackground: true });
                const pipelineResult = await pipeline.execute(
                    { buffer, mimeType: state.file.mimeType },
                    { userId: state.userId }
                );
                buffer = pipelineResult.data.buffer;
                if (pipelineResult.warnings.length > 0) {
                    warning = `\n:warning: ${pipelineResult.warnings.join("; ")}`;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                warning = `\n:warning: Background removal failed, uploading original: ${errorMessage}`;
                console.error(`Background removal failed: ${errorMessage}`);
            }
        }

        // Parse names for aliases
        const names = state.emojiName
            .split(",")
            .map((name: string) => name.replace(/:/g, "").trim().toLowerCase())
            .filter((name: string) => name.length > 0);

        const primaryName = names[0];
        const aliasNames = names.slice(1);

        // Upload the emoji
        const uploadResult = await uploadEmoji(primaryName, buffer);

        if (!uploadResult.ok) {
            const errorText = `Failed to add \`:${primaryName}:\`:\n\`\`\`\n${humanizeSlackError(uploadResult)}\n\`\`\``;
            await context.client.chat.update({
                channel: state.channelId,
                ts: messageTs,
                text: errorText,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: errorText,
                        },
                    },
                ],
            });
            console.log(`Failed to upload emoji ${primaryName}: ${uploadResult.error}`);
            return;
        }

        console.log(`User ${state.userId} uploaded emoji: ${primaryName}`);

        // Create aliases
        const successfulAliases: string[] = [];
        const failedAliases: string[] = [];

        for (const aliasName of aliasNames) {
            const aliasResult = await createAlias(aliasName, primaryName);
            if (aliasResult.ok) {
                successfulAliases.push(aliasName);
                console.log(`Created alias ${aliasName} -> ${primaryName}`);
            } else {
                failedAliases.push(aliasName);
                console.log(`Failed to create alias ${aliasName}: ${aliasResult.error}`);
            }
        }

        // Build success message
        let successText = `:${primaryName}: has been added`;

        if (successfulAliases.length > 0) {
            successText += ` with aliases: ${successfulAliases.map((a) => `\`:${a}:\``).join(", ")}`;
        }

        if (failedAliases.length > 0) {
            successText += `\n:warning: Failed to create aliases: ${failedAliases.map((a) => `\`:${a}:\``).join(", ")}`;
        }

        successText += warning;
        successText += `\nthanks <@${state.userId}>!`;

        await context.client.chat.update({
            channel: state.channelId,
            ts: messageTs,
            text: successText,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: successText,
                    },
                },
            ],
        });

        // Add reaction with the new emoji
        try {
            await app.client.reactions.add({
                name: primaryName,
                channel: state.channelId,
                timestamp: state.messageTs,
            });
        } catch (error) {
            console.log(`Failed to add reaction for ${primaryName}: ${error}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorText = `Failed to process upload: ${errorMessage}`;

        await context.client.chat.update({
            channel: state.channelId,
            ts: messageTs,
            text: errorText,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: errorText,
                    },
                },
            ],
        });

        console.error(`Error processing upload: ${errorMessage}`);
    }
}

export default uploadHandler;
