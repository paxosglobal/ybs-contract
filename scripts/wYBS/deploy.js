const { ethers, upgrades } = require("hardhat");
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const { ValidateInitializerArgs } = require('../utils/helpers');

require("dotenv").config();

const { WYBS_CONTRACT_NAME, WYBS_CONTRACT_SYMBOL, YBS_ADDRESS, ADMIN_ADDRESS, PAUSER, ASSET_PROTECTOR } = process.env;

const initializerArgs = [
  WYBS_CONTRACT_NAME,
  WYBS_CONTRACT_SYMBOL,
  YBS_ADDRESS,
  ADMIN_ADDRESS,
  PAUSER,
  ASSET_PROTECTOR,
];

const main = async () => {
  ValidateInitializerArgs(initializerArgs);

  const [deployer] = await ethers.getSigners();

  console.log('Deployer: %s', await deployer.getAddress());

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance: %s', ethers.formatEther(balance));

  console.log("\nDeploying the contract...")

  const contractFactory = await ethers.getContractFactory('wYBSV1');
  const contract = await upgrades.deployProxy(contractFactory, initializerArgs, {
    initializer: 'initialize',
    kind: 'uups',
  });

  console.log("Deploy tx: %s", contract.deploymentTransaction().hash)

  await contract.waitForDeployment();

  console.log('%s contract proxy address: %s', WYBS_CONTRACT_SYMBOL, contract.target);
  console.log('%s implementation address: %s', WYBS_CONTRACT_SYMBOL, await getImplementationAddress(ethers.provider, contract.target))
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
});
