FROM node:16-alpine
WORKDIR /app
# Copy and download dependencies
COPY package.json yarn.lock ./
COPY ./tsconfig.json ./
RUN yarn --frozen-lockfile
COPY src ./
RUN yarn build


FROM node:16-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn --production=true --frozen-lockfile
COPY --from=0 /app/dist ./dist
CMD yarn start
