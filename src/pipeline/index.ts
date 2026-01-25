import type { ImageData, PipelineContext, ProcessingStep, StepResult } from "./types";
import { RemoveBackgroundStep } from "./steps/removeBackground";

export interface PipelineOptions {
    removeBackground?: boolean;
}

export interface PipelineResult {
    success: boolean;
    data: ImageData;
    warnings: string[];
}

export class ImagePipeline {
    private steps: ProcessingStep[] = [];

    addStep(step: ProcessingStep): this {
        this.steps.push(step);
        return this;
    }

    async execute(input: ImageData, context: PipelineContext): Promise<PipelineResult> {
        let currentData = input;
        const warnings: string[] = [];

        for (const step of this.steps) {
            const result: StepResult = await step.execute(currentData, context);

            if (!result.success) {
                warnings.push(`${step.name}: ${result.error}`);
            }

            if (result.data) {
                currentData = result.data;
            }
        }

        return {
            success: warnings.length === 0,
            data: currentData,
            warnings,
        };
    }
}

export function createPipeline(options: PipelineOptions): ImagePipeline {
    const pipeline = new ImagePipeline();

    if (options.removeBackground) {
        pipeline.addStep(new RemoveBackgroundStep());
    }

    return pipeline;
}

export * from "./types";
