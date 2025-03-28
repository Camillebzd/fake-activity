import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "";

// Polygon
const AMOY_RPC_URL =
  process.env.AMOY_RPC_URL ||
  "https://polygon-amoy.g.alchemy.com/v2/your-api-key";
const POLYGONSCAN_API_KEY =
  process.env.POLYGONSCAN_API_KEY ||
  "";

// Ethereum
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://eth-sepolia.g.alchemy.com/v2/your-api-key";
const ETHERSCAN_API_KEY =
  process.env.ETHERSCAN_API_KEY ||
  "";

// Etherlink testnet
const ETHERLINK_TESTNET_RPC_URL =
  process.env.ETHERLINK_TESTNET_RPC_URL ||
  "https://node.ghostnet.etherlink.com";
const ETHERLINK_TESTNET_API_KEY =
  process.env.ETHERLINK_TESTNET_API_KEY ||
  "";

// Etherlink
const ETHERLINK_RPC_URL =
  process.env.ETHERLINK_RPC_URL ||
  "https://node.mainnet.etherlink.com";
const ETHERLINK_API_KEY =
  process.env.ETHERLINK_API_KEY ||
  "";

// Arbitrum
const ARBITRUM_SEPOLIA_RPC_URL =
  process.env.ARBITRUM_SEPOLIA_RPC_URL ||
  "https://sepolia-rollup.arbitrum.io/rpc";
const ARBITRUM_SEPOLIA_API_KEY =
  process.env.ARBITRUM_SEPOLIA_API_KEY ||
  "";

// Binance Smart Chain
const BSC_TESTNET_URL =
  process.env.BSC_TESTNET_URL ||
  "https://bsc-testnet.publicnode.com";
const BSCSCAN_API_KEY =
  process.env.BSCSCAN_API_KEY ||
  "";

const config: HardhatUserConfig = {
  solidity: "0.8.22",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545/",
      chainId: 31337
    },
    amoy: {
      chainId: 80002,
      url: AMOY_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
    sepolia: {
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY]
    },
    etherlinkTestnet: {
      chainId: 128123,
      url: ETHERLINK_TESTNET_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
    etherlink: {
      chainId: 42793,
      url: ETHERLINK_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
    arbitrumSepolia: {
      chainId: 421614,
      url: ARBITRUM_SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
    bscTestnet: {
      chainId: 97,
      url: BSC_TESTNET_URL,
      accounts: [PRIVATE_KEY],
    }
  },
  etherscan: {
    apiKey: {
      polygonAmoy: POLYGONSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      etherlinkTestnet: ETHERLINK_TESTNET_API_KEY,
      etherlink: ETHERLINK_API_KEY,
      arbitrumSepolia: ARBITRUM_SEPOLIA_API_KEY,
      bscTestnet: BSCSCAN_API_KEY,
    },
    customChains: [
      {
        network: "etherlinkTestnet",
        chainId: 128123,
        urls: {
          apiURL: "https://testnet.explorer.etherlink.com/api",
          browserURL: "https://testnet.explorer.etherlink.com"
        }
      },
      {
        network: "etherlink",
        chainId: 42793,
        urls: {
          apiURL: "https://explorer.etherlink.com/api",
          browserURL: "https://explorer.etherlink.com"
        }
      }
    ]
  }
};

export default config;
