const { ethers } = require("hardhat");
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');

async function printDeployerDetails() {
  const [deployer] = await ethers.getSigners();
  console.log('Deployer: %s', await deployer.getAddress());

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance: %s', ethers.formatEther(balance));
}

async function printContractDetails(contract, contractName) {
  console.log("%s contract deployed at: %s", contractName, await contract.getAddress());
  console.log("%s contract deploy tx: %s", contractName, contract.deploymentTransaction().hash)
}

async function printProxyAndImplementation(contract, contractName) {
  console.log("%s proxy address: %s", contractName, await contract.getAddress());
  console.log('%s implementation address: %s', contractName, await getImplementationAddress(ethers.provider, contract.target))
  console.log("%s contract deploy tx: %s", contractName, contract.deploymentTransaction().hash)
}

// Throws an error if any of the arguments are falsy or undefined.
function validateEnvironmentVariables(args) {
  args.forEach((arg, index) => {
    if (!arg) {
      throw new Error(`Missing environment variable at index ${index}`);
    }
  });
}

module.exports = {
  printDeployerDetails,
  printContractDetails,
  printProxyAndImplementation,
  validateEnvironmentVariables,
}