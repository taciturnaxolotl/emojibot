import Replicate from "replicate";
import config from "../config";

const MODEL_ID =
	"lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1";

/** Replicate returns the result as a bare URL, a `url()` method, or a `url` field. */
function readOutputUrl(output: unknown): string {
	if (typeof output === "string") return output;

	if (output && typeof output === "object" && "url" in output) {
		const url = (output as { url: unknown }).url;
		if (typeof url === "function") return String(url.call(output));
		if (typeof url === "string") return url;
	}

	throw new Error(
		`Unexpected output from remove-bg model: ${JSON.stringify(output)}`,
	);
}

export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
	const base64 = imageBuffer.toString("base64");
	const mimeType = "image/png";
	const dataUri = `data:${mimeType};base64,${base64}`;

	const replicate = new Replicate({
		auth: process.env.HACKCLUB_AI_TOKEN!,
		baseUrl: config.replicateBaseUrl,
	});

	const input = { image: dataUri };
	const output = await replicate.run(MODEL_ID, { input });
	const outputUrl = readOutputUrl(output);

	const imageResponse = await fetch(outputUrl);
	if (!imageResponse.ok) {
		throw new Error(
			`Failed to fetch processed image: ${imageResponse.statusText}`,
		);
	}

	const arrayBuffer = await imageResponse.arrayBuffer();
	return Buffer.from(arrayBuffer);
}
