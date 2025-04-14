# Sample Hardhat Project

## Setup

Start by installing the dependencies by running:
```bash
npm i
```

Then you need to create a `.env` file like:
```
PRIVATE_KEY=

AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/your-api-key
POLYGONSCAN_API_KEY=

SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-api-key
ETHERSCAN_API_KEY=

ETHERLINK_TESTNET_RPC_URL=https://node.ghostnet.etherlink.com
ETHERLINK_TESTNET_API_KEY=YOUCANCOPYME0000000000000000000000

ETHERLINK_RPC_URL=https://node.mainnet.etherlink.com
ETHERLINK_API_KEY=YOUCANCOPYME0000000000000000000000

ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_SEPOLIA_API_KEY=

BSC_TESTNET_URL=https://bsc-testnet.publicnode.com
BSCSCAN_API_KEY=

OPTIMISM_SEPOLIA_URL=https://optimism-sepolia.drpc.org
OPTISCAN_API_KEY=
```

## Create users

You can generate users by running:
```bash
npx hardhat run scripts/generateAccounts
```

This will be necessary if you want to simulate activity from a different users and not only from your main key. You can controle how many users you generate by changing `NUM_ACCOUNTS` in the script directly.

## Funds users

You can funds the users with gas tokens and testnet tokens. To do so, run:
```bash
npx hardhat run scripts/fundAddresses.ts --network <supported-network>
```

You can control the parameters of the script at the top to only send gas token, the number of users per batch, the amount of time to wait between batches, etc.

## Simulate activity on the WAB

To send tokens on the WAB, run:
```bash
```