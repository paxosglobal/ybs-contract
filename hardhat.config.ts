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
  ETHERSCAN_API_KEY
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
    ethSepolia: {
      url: "https://sepolia.infura.io/v3/" + INFURA_API_KEY,
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
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
