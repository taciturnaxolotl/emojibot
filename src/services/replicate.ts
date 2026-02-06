import config from "../config";

const MODEL_VERSION =
	"a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
	const base64 = imageBuffer.toString("base64");
	const mimeType = "image/png";
	const dataUri = `data:${mimeType};base64,${base64}`;

	// Call Hack Club AI proxy directly with version in URL path
	// The proxy expects: /replicate/models/:owner/:model:version/predictions
	const url = `${config.replicateBaseUrl}/models/851-labs/background-remover:${MODEL_VERSION}/predictions`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.HACKCLUB_AI_TOKEN}`,
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
		throw new Error(
			`removeBackground: Request to ${url} failed with status ${response.status} ${response.statusText}: ${text}`,
		);
	}

	const data = await response.json();

	// The response contains the prediction result with output URL
	const outputUrl = data.output;
	if (typeof outputUrl !== "string") {
		throw new Error(
			`Unexpected output from remove-bg model: ${JSON.stringify(data)}`,
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
