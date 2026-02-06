import Replicate from "replicate";
import config from "../config";

const MODEL_ID =
	"851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

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

	// Handle different output formats
	let outputUrl: string;
	if (typeof output === "string") {
		outputUrl = output;
	} else if (output && typeof output.url === "function") {
		outputUrl = output.url();
	} else if (output && typeof output === "object" && "url" in output) {
		outputUrl = output.url as string;
	} else {
		throw new Error(
			`Unexpected output from remove-bg model: ${JSON.stringify(output)}`,
		);
	}

	const imageResponse = await fetch(outputUrl);
	if (!imageResponse.ok) {
		throw new Error(
			`Failed to fetch processed image: ${imageResponse.statusText}`,
		);
	}

	const arrayBuffer = await imageResponse.arrayBuffer();
	return Buffer.from(arrayBuffer);
}
