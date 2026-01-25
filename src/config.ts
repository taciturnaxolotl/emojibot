const config = {
    channel: process.env.SLACK_CHANNEL!,
    slackWorkspace: process.env.SLACK_WORKSPACE!,
    admins: process.env.ADMINS?.split(",") ?? [],
    replicateBaseUrl: process.env.REPLICATE_BASE_URL ?? "https://ai.hackclub.com/proxy/v1/replicate",
};

export default config;
