// Slack accepts lowercase alphanumerics plus _ + - in custom emoji names.
const VALID_EMOJI_NAME = /^[a-z0-9_+-]+$/;

/** Parses comma-separated user text into [primary, ...aliases]. */
export function parseEmojiNames(text: string): string[] {
	return text
		.split(",")
		.map((name) => name.replace(/:/g, "").trim().toLowerCase())
		.filter((name) => name.length > 0);
}

/** Coerces a filename into a usable emoji name. */
export function emojiNameFromFilename(filename: string): string {
	return filename
		.replace(/\.[^/.]+$/, "")
		.toLowerCase()
		.replace(/[^a-z0-9_+-]/g, "_");
}

export function invalidEmojiNames(names: string[]): string[] {
	return names.filter((name) => !VALID_EMOJI_NAME.test(name));
}

/** Renders `:primary:`, listing aliases after it when there are any. */
export function describeEmojiNames([primary, ...aliases]: string[]): string {
	const head = `\`:${primary}:\``;
	if (aliases.length === 0) return head;
	return `${head} (aliases ${listEmojiNames(aliases)})`;
}

export function listEmojiNames(names: string[]): string {
	return names.map((name) => `\`:${name}:\``).join(", ");
}
