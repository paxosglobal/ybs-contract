const { ethers, upgrades } = require("hardhat");
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');

require("dotenv").config();

const { ADMIN_ADDRESS, SUPPLY_CONTROLLER, PAUSER, ASSET_PROTECTOR, REBASER_ADMIN, REBASER } = process.env;
const contractName = 'Phase Zero';
const contractSymbol = 'USDX';
const contractDecimals = 18;

const initializerArgs = [
  contractName,
  contractSymbol,
  contractDecimals,
  ADMIN_ADDRESS,
  SUPPLY_CONTROLLER,
  PAUSER,
  ASSET_PROTECTOR,
  REBASER_ADMIN,
  REBASER
];

const main = async () => {
  const [deployer] = await ethers.getSigners();

  console.log('Deployer: %s', await deployer.getAddress());

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance: %s', ethers.formatEther(balance));

  console.log("\nDeploying the contract...")

  const contractFactory = await ethers.getContractFactory('YBSV1');
  const contract = await upgrades.deployProxy(contractFactory, initializerArgs, {
    initializer: 'initialize',
    kind: 'uups',
  });

  console.log("Deploy tx: %s", contract.deploymentTransaction().hash)

  await contract.waitForDeployment();

  console.log('%s contract proxy address: %s', contractSymbol, contract.target);
  console.log('%s implementation address: %s', contractSymbol, await getImplementationAddress(ethers.provider, contract.target))
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
});
