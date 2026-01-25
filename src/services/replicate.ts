import config from "../config";

const MODEL_VERSION = "95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1";

export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
    const base64 = imageBuffer.toString("base64");
    const mimeType = "image/png";
    const dataUri = `data:${mimeType};base64,${base64}`;

    // Call Hack Club AI proxy directly with version in URL path
    // The proxy expects: /replicate/models/:owner/:model:version/predictions
    const url = `${config.replicateBaseUrl}/models/lucataco/remove-bg:${MODEL_VERSION}/predictions`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.HACKCLUB_AI_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            input: {
                image: dataUri,
            },
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`removeBackground: Request to ${url} failed with status ${response.status} ${response.statusText}: ${text}`);
    }

    const data = await response.json();

    // The response contains the prediction result with output URL
    const outputUrl = data.output;
    if (typeof outputUrl !== "string") {
        throw new Error("Unexpected output from remove-bg model: " + JSON.stringify(data));
    }

    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) {
        throw new Error(`Failed to fetch processed image: ${imageResponse.statusText}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
