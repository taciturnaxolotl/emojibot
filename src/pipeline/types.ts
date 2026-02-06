export interface ImageData {
	buffer: Buffer;
	mimeType: string;
}

export interface PipelineContext {
	userId: string;
	onProgress?: (step: string, status: string) => Promise<void>;
}

export interface StepResult {
	success: boolean;
	data?: ImageData;
	error?: string;
}

export interface ProcessingStep {
	name: string;
	execute(input: ImageData, context: PipelineContext): Promise<StepResult>;
}
