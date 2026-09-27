import { beforeEach, expect, mock, test } from "bun:test";

const uploaded: { name: string; bytes: number }[] = [];
const aliased: { alias: string; target: string }[] = [];
let aliasFails: string[] = [];

mock.module("../services/slack-emoji", () => ({
	uploadEmoji: async (name: string, buffer: Buffer) => {
		uploaded.push({ name, bytes: buffer.length });
		return { ok: true };
	},
	createAlias: async (alias: string, target: string) => {
		aliased.push({ alias, target });
		return aliasFails.includes(alias)
			? { ok: false, error: "error_name_taken" }
			: { ok: true };
	},
}));

mock.module("../services/file-manager", () => ({
	downloadSlackFile: async () => Buffer.from("png"),
}));

const { default: uploadModal } = await import("./uploadModal");
const { default: uploadActions } = await import("./uploadActions");

const OWNER = "U_owner";

/** Records everything the bot says and hands back the buttons it offered. */
function fakeSlack() {
	const posted: string[] = [];
	const updated: string[] = [];
	const ephemeral: string[] = [];
	const reactions: string[] = [];
	let buttons: any[] = [];

	const context = {
		respond: async (m: any) => ephemeral.push(m.text),
		client: {
			chat: {
				postMessage: async (m: any) => {
					posted.push(m.text);
					buttons =
						m.blocks?.find((b: any) => b.type === "actions")?.elements ?? [];
				},
				update: async (m: any) => updated.push(m.text),
				delete: async () => {},
			},
			reactions: {
				add: async (r: any) => reactions.push(`+${r.name}`),
				remove: async (r: any) => reactions.push(`-${r.name}`),
			},
		},
	};

	return {
		context,
		posted,
		updated,
		ephemeral,
		reactions,
		button: (id: string) => buttons.find((b) => b.action_id === id),
	};
}

/** Collects the handlers the features register so tests can invoke them. */
function fakeApp(admins: string[] = []) {
	const messageHandlers: any[] = [];
	const actions = new Map<string, any>();
	const app: any = {
		anyMessage: (fn: any) => messageHandlers.push(fn),
		action: (id: string, _ack: any, fn: any) => actions.set(id, fn),
		client: {
			users: {
				info: async ({ user }: any) => ({
					user: { is_admin: admins.includes(user) },
				}),
			},
		},
	};
	return { app, messageHandlers, actions };
}

async function runFlow(
	text: string,
	opts: { filename?: string; mimetype?: string; admins?: string[] } = {},
) {
	const { app, messageHandlers, actions } = fakeApp(opts.admins);
	await uploadModal(app);
	await uploadActions(app);

	const slack = fakeSlack();
	await messageHandlers[0]({
		payload: {
			subtype: "file_share",
			channel: process.env.SLACK_CHANNEL!,
			ts: "111.0",
			user: OWNER,
			text,
			files: [
				{
					id: "F1",
					url_private: "https://slack/f",
					name: opts.filename ?? "blob.png",
					mimetype: opts.mimetype ?? "image/png",
				},
			],
		},
		context: slack.context,
	});

	const click = async (actionId: string, clicker = OWNER) => {
		const button = slack.button(actionId);
		await actions.get(actionId)({
			payload: button,
			body: {
				message: { ts: "222.0" },
				actions: [button],
				user: { id: clicker },
			},
			context: slack.context,
		});
	};

	return { slack, click };
}

beforeEach(() => {
	uploaded.length = 0;
	aliased.length = 0;
	aliasFails = [];
});

test("prompt names the emoji and lists its aliases separately", async () => {
	const { slack } = await runFlow("blob,blobby,blobbo");

	expect(slack.posted[0]).toBe(
		"How would you like to upload `:blob:` aliased as `:blobby:`, `:blobbo:`?",
	);
	// the old flow rendered `:blob,blobby,blobbo:`, which is not an emoji ref
	expect(slack.posted[0]).not.toContain(":blob,");
});

test("a single name reads exactly as it did before", async () => {
	const { slack } = await runFlow("blob");
	expect(slack.posted[0]).toBe("How would you like to upload `:blob:`?");
});

test("uploads the first name and aliases the rest", async () => {
	const { slack, click } = await runFlow("blob,blobby");
	await click("upload_normal");

	expect(uploaded).toEqual([{ name: "blob", bytes: 3 }]);
	expect(aliased).toEqual([{ alias: "blobby", target: "blob" }]);
	expect(slack.updated[0]).toBe("Uploading `:blob:` (aliases `:blobby:`)...");
	expect(slack.updated[1]).toContain(
		":blob: has been added with aliases: `:blobby:`",
	);
});

test("reports aliases slack refused without failing the upload", async () => {
	aliasFails = ["taken"];
	const { slack, click } = await runFlow("blob,taken,fine");
	await click("upload_normal");

	expect(uploaded).toEqual([{ name: "blob", bytes: 3 }]);
	expect(slack.updated[1]).toContain("with aliases: `:fine:`");
	expect(slack.updated[1]).toContain("Failed to create aliases: `:taken:`");
});

test("gifs are offered upload-or-cancel, with no background removal", async () => {
	const { slack } = await runFlow("blob", { mimetype: "image/gif" });

	expect(slack.posted[0]).toBe("Would you like to upload this as `:blob:`?");
	expect(slack.button("upload_remove_bg")).toBeUndefined();
	expect(slack.button("upload_cancel")).toBeDefined();
});

test("falls back to the filename when the message is a sentence", async () => {
	const { slack } = await runFlow("here is a cool emoji", {
		filename: "My Blob!.png",
	});
	expect(slack.posted[0]).toBe("How would you like to upload `:my_blob_:`?");
});

test("refuses a name slack would reject instead of uploading it", async () => {
	const { slack } = await runFlow("foo$bar");

	expect(slack.posted[0]).toContain("Can't use `:foo$bar:`");
	expect(slack.button("upload_normal")).toBeUndefined();
	expect(uploaded).toEqual([]);
});

test("marks the source message working, then swaps in the emoji", async () => {
	const { slack, click } = await runFlow("blob");
	await click("upload_normal");

	expect(slack.reactions).toEqual([
		"+emojbot-working",
		"-emojbot-working",
		"+blob",
	]);
});

test("a bystander cannot drive someone else's buttons", async () => {
	const { slack, click } = await runFlow("blob,blobby");
	await click("upload_normal", "U_bystander");

	expect(uploaded).toEqual([]);
	expect(aliased).toEqual([]);
	expect(slack.ephemeral[0]).toContain(`Only <@${OWNER}> or an admin`);
});

test("an admin can drive someone else's buttons", async () => {
	const { click } = await runFlow("blob,blobby", { admins: ["U_admin"] });
	await click("upload_normal", "U_admin");

	expect(uploaded).toEqual([{ name: "blob", bytes: 3 }]);
	expect(aliased).toEqual([{ alias: "blobby", target: "blob" }]);
});
