# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.2.11 as base
WORKDIR /usr/src/app

# install with --production (exclude devDependencies)
FROM base AS build
RUN mkdir -p /temp/emojibot-prod
COPY . /temp/emojibot-prod
RUN cd /temp/emojibot-prod && bun install --frozen-lockfile --production && bun run build

# copy production build to release image
FROM base AS release
COPY --from=build /temp/emojibot-prod/dist/emojibot .
RUN chown -R bun:bun .
RUN mkdir tmp && chown -R bun:bun tmp

# run the app
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "./emojibot" ]
