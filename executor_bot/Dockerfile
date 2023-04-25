FROM node:16-alpine
WORKDIR /app
# Copy and download dependencies
COPY package.json yarn.lock ./
COPY ./tsconfig.json ./
RUN yarn --frozen-lockfile
RUN rm -rf node_modules/@mithraic-labs/poseidon/node_modules
RUN rm -rf node_modules/@raydium-io/raydium-sdk/node_modules
COPY src ./
RUN yarn build


FROM node:16-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn --production=true --frozen-lockfile
RUN rm -rf node_modules/@mithraic-labs/poseidon/node_modules
RUN rm -rf node_modules/@raydium-io/raydium-sdk/node_modules
COPY --from=0 /app/dist ./dist
CMD yarn start
