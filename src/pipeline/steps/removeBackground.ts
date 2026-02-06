import type {
	ProcessingStep,
	ImageData,
	PipelineContext,
	StepResult,
} from "../types";
import { removeBackground as removeBackgroundService } from "../../services/replicate";

export class RemoveBackgroundStep implements ProcessingStep {
	name = "removeBackground";

	async execute(
		input: ImageData,
		context: PipelineContext,
	): Promise<StepResult> {
		try {
			if (context.onProgress) {
				await context.onProgress(this.name, "Processing background removal...");
			}

			const processedBuffer = await removeBackgroundService(input.buffer);

			return {
				success: true,
				data: {
					buffer: processedBuffer,
					mimeType: "image/png",
				},
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error(`Background removal failed: ${errorMessage}`);

			return {
				success: false,
				error: errorMessage,
				data: input, // Return original on failure
			};
		}
	}
}
