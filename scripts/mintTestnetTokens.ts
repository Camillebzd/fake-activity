import { ethers, network } from "hardhat";

async function main() {
  const [mainSigner] = await ethers.getSigners();
  let tokenAddress: string;
  switch (network.name) {
    case "arbitrumSepolia":
      tokenAddress = "0x137d4e9C2431A3DCBa6e615E9438F2c558353a17";
      break;
    case "bscTestnet":
      tokenAddress = "0x89A44C4fa11630E11425c177cE08828179A249A6";
      break;
    case "optimismSepolia":
      tokenAddress = "0x137d4e9C2431A3DCBa6e615E9438F2c558353a17";
      break;
    default:
      throw new Error("Unsupported network");
  };
  const token = new ethers.Contract(tokenAddress, [
    "function mint(address _to, uint256 _amount) external",
    "function decimals() external view returns (uint8)",
  ], mainSigner);
  const tx = await token.mint(await mainSigner.getAddress(), 10000000n * 10n ** (await token.decimals()));
  await tx.wait();
  console.log("Minted 10000000 tokens to", await mainSigner.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });