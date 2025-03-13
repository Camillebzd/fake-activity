import { ethers } from "hardhat";

async function main() {
  const GasBurner = await ethers.getContractFactory("GasBurner");
  const gasBurner = await GasBurner.deploy();

  await gasBurner.waitForDeployment();
  console.log("GasBurner address:", await gasBurner.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });