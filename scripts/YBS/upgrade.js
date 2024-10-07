const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

const { PROXY_ADDRESS } = process.env;

const main = async () => {
  
  const [deployer] = await ethers.getSigners();

  console.log('Deployer: %s', await deployer.getAddress());

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance: %s', ethers.formatEther(balance));

  console.log('Upgrading contract... %s', PROXY_ADDRESS);

  const newContract = await ethers.getContractFactory('YBSV1');
  const tx = await upgrades.upgradeProxy(PROXY_ADDRESS, newContract);

  console.log("Deploy tx: %s", tx.deployTransaction.hash);

  console.log('Contract upgraded');

};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
});
