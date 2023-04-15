## How to run locally

0. if running using yarn dev:

```
 rm -rf node_modules/@mithraic-labs/poseidon/node_modules
 rm -rf node_modules/@raydium-io/raydium-sdk/node_modules
```

1. Create `.envrc` file in this directory and add the following

```
export POSTGRES_DB=executor_bot
export POSTGRES_USER=user
export POSTGRES_PASSWORD=pass

export JSON_RPC_URL=http://host.docker.internal:8899
export GRAPHILE_LOGGER_DEBUG=1
export SECRET_KEY=NEVER_SHARE_YOUR_SECRET_KEY
```

2. install direnv (macOS: brew, ubuntu: apt) + [hook into shell](https://direnv.net/docs/hook.html)

3. run `direnv allow && docker-compose up --build`. it will probably take a few mins of docker doing its thing before everything is ready

## Deploying to AWS

1. Create a Solana private key in AWS Secrets manager
2. Create a database password in AWS Secrets manager
3. Update the compose file to include the ARNs for the secrets
4. Run the following to build and deploy

### Devnet

1. Build new image

```
direnv allow && \
docker context use default && \
docker build -t psyoptions/executor_bot . && \
docker push psyoptions/executor_bot:latest
```

2. Get the sha256 of the image from [docker hub](https://hub.docker.com/repository/docker/psyoptions/executor_bot/tags?page=1&ordering=last_updated)
3. Replace the sha256 of the image in the cloudformation template yaml file
4. Deploy to AWS
   `aws cloudformation deploy --template-file cloudformation/template.yml --stack-name executor-bot-devnet --parameter-overrides JsonRpcUrl=https://api.devnet.solana.com GraphileLoggerDebug=1 HoneybadgerKey=$HONEY_BADGER_KEY --capabilities CAPABILITY_NAMED_IAM`

### Mainnt

1. Deploy with AWS CLI
   `aws cloudformation deploy --template-file cloudformation/template.yml --stack-name executor-bot-mainnet --parameter-overrides JsonRpcUrl=https://psyoptions.genesysgo.net HoneybadgerKey=$HONEY_BADGER_KEY --capabilities CAPABILITY_NAMED_IAM`
