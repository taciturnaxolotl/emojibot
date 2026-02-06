import config from "./src/config";

// RAW FETCH THAT WORKS (from browser capture)
const deleteEmojiRaw = async (emojiName: string) => {
    const res = await fetch(
        `https://hackclub.slack.com/api/emoji.remove?_x_id=03f7066c-1770392535.510&slack_route=E09V59WQY1E%3AT0266FRGM&_x_version_ts=noversion&fp=eb&_x_num_retries=0`,
        {
            headers: {
                accept: "*/*",
                "accept-language": "en-US,en;q=0.9",
                "cache-control": "no-cache",
                "content-type":
                    "multipart/form-data; boundary=----WebKitFormBoundaryPctxjoXzhbDkfMcB",
                pragma: "no-cache",
                priority: "u=1, i",
                "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"macOS"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                cookie: process.env.SLACK_COOKIE!,
            },
            body: '------WebKitFormBoundaryPctxjoXzhbDkfMcB\r\nContent-Disposition: form-data; name="token"\r\n\r\nxoxc-2210535565-6096548277490-10009535028705-9afc3ced86f80df223c4ac5a390bde3edf733f4ad10e6050cf300d0388c2b3af\r\n------WebKitFormBoundaryPctxjoXzhbDkfMcB\r\nContent-Disposition: form-data; name="name"\r\n\r\ncheck-nixi\r\n------WebKitFormBoundaryPctxjoXzhbDkfMcB\r\nContent-Disposition: form-data; name="_x_reason"\r\n\r\ncustomize-emoji-remove\r\n------WebKitFormBoundaryPctxjoXzhbDkfMcB\r\nContent-Disposition: form-data; name="_x_mode"\r\n\r\nonline\r\n------WebKitFormBoundaryPctxjoXzhbDkfMcB--\r\n',
            method: "POST",
        },
    );

    const result = await res.json() as { ok: boolean; error?: string };
    console.log("Raw fetch result:", result);
    return result;
};

// TEST VERSION - uses env vars and dynamic values
const deleteEmoji = async (emojiName: string) => {
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;

    // Create multipart form data manually
    const formData = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="token"`,
        "",
        process.env.SLACK_BOT_USER_TOKEN!,
        `--${boundary}`,
        `Content-Disposition: form-data; name="name"`,
        "",
        emojiName,
        `--${boundary}`,
        `Content-Disposition: form-data; name="_x_reason"`,
        "",
        "customize-emoji-remove",
        `--${boundary}`,
        `Content-Disposition: form-data; name="_x_mode"`,
        "",
        "online",
        `--${boundary}--`,
        "",
    ].join("\r\n");

    // Build URL with query parameters
    // slack_route should be enterprise_id:team_id format
    const slackRoute = `${process.env.SLACK_ENTERPRISE_ID}:${process.env.SLACK_TEAM_ID}`;

    const queryParams = new URLSearchParams({
        _x_id: `${Date.now()}.${Math.random()}`,
        slack_route: slackRoute,
        _x_version_ts: "noversion",
        fp: "eb",
        _x_num_retries: "0",
    });

    // URL should use domain from env
    const url = `https://${process.env.SLACK_DOMAIN}.slack.com/api/emoji.remove?${queryParams.toString()}`;

    console.log("Test URL:", url);
    console.log("Test boundary:", boundary);

    const res = await fetch(url, {
        method: "POST",
        headers: {
            accept: "*/*",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "content-type": `multipart/form-data; boundary=${boundary}`,
            pragma: "no-cache",
            "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            cookie: process.env.SLACK_COOKIE!,
        },
        body: formData,
    });

    const result = await res.json() as { ok: boolean; error?: string };
    console.log(`Test fetch for ${emojiName}:`, JSON.stringify(result));
    return result;
};

// Run tests
console.log("=== Testing RAW version (with hardcoded token) ===");
const rawResult = await deleteEmojiRaw("check-nixi");
console.log("Raw result:", JSON.stringify(rawResult));

console.log("\n=== Testing TEST version (with env vars) ===");
const testResult = await deleteEmoji("check-nixi");
console.log("Test result:", JSON.stringify(testResult));
