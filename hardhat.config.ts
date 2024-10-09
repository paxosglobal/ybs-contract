import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-chai-matchers';
import '@openzeppelin/hardhat-upgrades';
import "@nomiclabs/hardhat-solhint";
import 'solidity-coverage';
import "hardhat-gas-reporter"
import dotenv from 'dotenv';

dotenv.config();

const {
  PRIVATE_KEY,
  INFURA_API_KEY,
  ETHERSCAN_API_KEY,
  ARBISCAN_API_KEY
} = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: 'hardhat',
  networks: {
    mainnet: {
      url: "https://mainnet.infura.io/v3/" + INFURA_API_KEY,
      ...(PRIVATE_KEY ? { accounts: [PRIVATE_KEY] } : {}),
    },
    sepolia: {
      url: "https://sepolia.infura.io/v3/" + INFURA_API_KEY,
      ...(PRIVATE_KEY ? { accounts: [PRIVATE_KEY] } : {}),
    },
    arbitrumOne: {
      url: "https://arbitrum-mainnet.infura.io/v3/" + INFURA_API_KEY,
      ...(PRIVATE_KEY ? { accounts: [PRIVATE_KEY] } : {}),
    },
    arbitrumSepolia: {
      url: "https://arbitrum-sepolia.infura.io/v3/" + INFURA_API_KEY,
      ...(PRIVATE_KEY ? { accounts: [PRIVATE_KEY] } : {}),
    },
    polygonMainnet: {
      url: "https://polygon-mainnet.infura.io/v3/" + INFURA_API_KEY,
      ...(PRIVATE_KEY ? { accounts: [PRIVATE_KEY] } : {}),
    },
    polygonAmoy: {
      url: "https://polygon-amoy.infura.io/v3/" + INFURA_API_KEY,
      ...(PRIVATE_KEY ? { accounts: [PRIVATE_KEY] } : {}),
    },
    polygonMumbai: {
      url: "https://polygon-mumbai.infura.io/v3/" + INFURA_API_KEY,
      ...(PRIVATE_KEY ? { accounts: [PRIVATE_KEY] } : {}),
    },
  },
  gasReporter: {
    enabled: (process.env.GAS_REPORTER) ? true : false
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      arbitrumOne: ARBISCAN_API_KEY,
      arbitrumSepolia: ARBISCAN_API_KEY,
    },
  },
};

export default config;
