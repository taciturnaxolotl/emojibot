import { expect, test } from "bun:test";
import {
	describeEmojiNames,
	emojiNameFromFilename,
	invalidEmojiNames,
	listEmojiNames,
	parseEmojiNames,
} from "./emojiNames";

test("parses aliases, strips colons, normalizes case", () => {
	expect(parseEmojiNames("blob,blobby")).toEqual(["blob", "blobby"]);
	expect(parseEmojiNames(":Blob:,:BLOBBY:")).toEqual(["blob", "blobby"]);
	expect(parseEmojiNames("blob")).toEqual(["blob"]);
	expect(parseEmojiNames("a,,b")).toEqual(["a", "b"]);
	expect(parseEmojiNames(":::")).toEqual([]);
	expect(parseEmojiNames("")).toEqual([]);
	expect(parseEmojiNames(" blob , blobby ")).toEqual(["blob", "blobby"]);
});

test("is idempotent, so no caller needs to re-parse", () => {
	const once = parseEmojiNames(":Blob:, :Blobby:");
	expect(parseEmojiNames(once.join(","))).toEqual(once);
});

test("filename fallback always produces a valid name", () => {
	expect(emojiNameFromFilename("My Cool Emoji.PNG")).toBe("my_cool_emoji");
	expect(emojiNameFromFilename("wat$.gif")).toBe("wat_");
	expect(invalidEmojiNames([emojiNameFromFilename("a b/c!.png")])).toEqual([]);
});

test("rejects names slack will not accept", () => {
	expect(invalidEmojiNames(["ok_name", "a-b", "c+d", "n1"])).toEqual([]);
	expect(invalidEmojiNames(["foo$bar", "wat!"])).toEqual(["foo$bar", "wat!"]);
});

test("renders a single name bare and aliases alongside", () => {
	expect(describeEmojiNames(["blob"])).toBe("`:blob:`");
	expect(describeEmojiNames(["blob", "blobby"])).toBe(
		"`:blob:` (aliases `:blobby:`)",
	);
	expect(listEmojiNames(["a", "b"])).toBe("`:a:`, `:b:`");
});
