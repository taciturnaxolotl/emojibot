import Replicate from "replicate";
import config from "../config";

const replicate = new Replicate({
    baseUrl: config.replicateBaseUrl,
    auth: process.env.HACKCLUB_AI_TOKEN,
});

export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
    const base64 = imageBuffer.toString("base64");
    const mimeType = "image/png";
    const dataUri = `data:${mimeType};base64,${base64}`;

    const output = await replicate.run("lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1", {
        input: {
            image: dataUri,
        },
    });

    if (typeof output !== "string") {
        throw new Error("Unexpected output from remove-bg model");
    }

    const response = await fetch(output);
    if (!response.ok) {
        throw new Error(`Failed to fetch processed image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
