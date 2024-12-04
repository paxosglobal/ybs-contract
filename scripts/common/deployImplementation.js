const { ethers } = require("hardhat");
const { TOKEN_CONTRACT_NAME} = process.env;

const { printDeployerDetails, printContractDetails, validateEnvironmentVariables } = require('../utils/helpers');

async function main() {
  validateEnvironmentVariables([TOKEN_CONTRACT_NAME])
  printDeployerDetails();

  console.log("\nDeploying Implementation contract...")
  const contractFactoryImplementation = await ethers.getContractFactory(TOKEN_CONTRACT_NAME);
  const contract = await contractFactoryImplementation.deploy();
  await contract.waitForDeployment();
  await printContractDetails(contract, TOKEN_CONTRACT_NAME + " implementation ")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
});
