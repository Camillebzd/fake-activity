import { ethers } from "hardhat";

async function main() {
  const Multicall = await ethers.getContractFactory("Multicall");
  const multicall = await Multicall.deploy();

  await multicall.waitForDeployment();
  console.log("Multicall address:", await multicall.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });