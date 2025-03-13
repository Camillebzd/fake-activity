import { ethers } from 'hardhat';

const GAS_BURNER_ADDRESS = '0x4bFb77c46988F9bd97394a4C567EBa17725b0f4B';

async function main(): Promise<void> {
  const provider = await ethers.provider;
  const [mainSigner] = await ethers.getSigners();

  const startingNonce = await mainSigner.getNonce();
  console.log(`Starting nonce: ${startingNonce}`);

  const gasBurner = await ethers.getContractAt('GasBurner', GAS_BURNER_ADDRESS, mainSigner);

  // Estimate gas
  const iterationParams = 178000;
  const transactionAmount = 200;
  let gasLimit = await gasBurner.burnGas.estimateGas(iterationParams);

  // Get dynamic execution fee
  const feeData = await provider.getFeeData();
  const baseFee = feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"); // Default min 1 gwei
  const maxFeePerGas = baseFee * 2n; // Safe buffer

  console.log(`Estimated gas: ${gasLimit.toString()}`);
  console.log(`Base fee: ${ethers.formatUnits(baseFee, "gwei")} gwei`);
  console.log(`Max fee: ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei`);

  // Gradually increasing delay to reduce fee spikes
  for (let i = 0; i < transactionAmount; i++) {
    console.log(`\nSending burnGas transaction ${i + 1}`);

    gasBurner.burnGas(iterationParams, {
      gasLimit,
      maxFeePerGas,
      nonce: startingNonce + i
    }).catch(error => console.error(`Transaction ${i + 1} failed:`, error));

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\nAll operations completed');
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });