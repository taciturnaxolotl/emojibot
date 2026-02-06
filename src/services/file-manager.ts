import { randomUUIDv7 } from "bun";
import { $ } from "bun";
import { readdir } from "fs/promises";

export async function downloadSlackFile(url: string): Promise<Buffer> {
	const response = await fetch(url, {
		headers: {
			Cookie: process.env.SLACK_COOKIE ?? "",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to download file: ${response.statusText}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

export async function createTempFile(
	buffer: Buffer,
	ext: string,
): Promise<string> {
	const filename = `${randomUUIDv7()}.${ext}`;
	const path = `tmp/${filename}`;
	await Bun.write(path, buffer);
	return path;
}

export async function cleanupTempFile(path: string): Promise<void> {
	try {
		await $`rm ${path}`;
	} catch {
		console.warn(`Failed to cleanup temp file: ${path}`);
	}
}

export async function cleanupOldTempFiles(
	maxAgeMs: number = 60 * 60 * 1000,
): Promise<void> {
	const tmpDir = "tmp";
	const now = Date.now();

	try {
		const files = await readdir(tmpDir);
		for (const file of files) {
			const filePath = `${tmpDir}/${file}`;
			const stat = await Bun.file(filePath).stat();
			if (now - stat.mtime.getTime() > maxAgeMs) {
				await cleanupTempFile(filePath);
				console.log(`Cleaned up old temp file: ${filePath}`);
			}
		}
	} catch (error) {
		console.warn(`Failed to cleanup temp files: ${error}`);
	}
}
