## WARNING

_Each leg of the trade uses the total amount of SPL token in the source account_


Example:


* 1 - you have a USDC account with X USDC, associated to your wallet
* 2 - you initiate a bounded trade for the following strategy: PSY -> BONK using 5000 PSY in collateral account (funded by someone else);
* 3 - The route for this trade ends up being PSY->USDC->BONK
* 4 - Since it's a multileg trade, we need a USDC account owned by the executing party (you), and since you already have one, that will be used
* 5 - first leg of the trade swaps PSY for USDC and puts the proceeds (P) into your USDC account so now its' value is (X USDC + P USDC)
* 6 - the second leg, USDC->BONK will use up ALL the collateral on your USDC account (X+P) to purchase BONK and then transfer that to the strategy initiator wallet (meaning you gifted someone all of your USDC converted to BONK)

!!!!

# TLDR: Use a fresh wallet for running this bot; make sure it has no SPL tokens stored in its' associated token accounts, otherwise those will most likely be drained in favor of the strategy initiator;

!!!!

## How to run locally

0. if running using yarn dev:

```
 rm -rf node_modules/@mithraic-labs/poseidon/node_modules
 rm -rf node_modules/@raydium-io/raydium-sdk/node_modules
```

1. Create `.envrc` file in this directory and add the following

```
export JSON_RPC_URL=<YOUR_RPC>
export SOLANA_CLUSTER="mainnet-beta"
export SOLANA_KEYPAIR_PATH="<PATH_TO_id.json>"
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
