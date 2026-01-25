import { randomUUIDv7 } from "bun";
import { $ } from "bun";

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

export async function createTempFile(buffer: Buffer, ext: string): Promise<string> {
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
