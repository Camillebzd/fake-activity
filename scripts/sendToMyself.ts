import { ethers, network } from 'hardhat';
import { TransactionRequest } from 'ethers';

// Settings
const TRANSACTION_AMOUNT = 10; // Amount of transactions to send
const MAX_TRANSACTIONS = 100000; // Maximum number of transactions to send
const AMOUNT_TO_SEND = ethers.parseEther("0.000001"); // Amount to send per transaction

// Main function to send multiple transactions
async function main(): Promise<void> {
  const [mainSigner] = await ethers.getSigners();
  const currentNonce = await mainSigner.getNonce();
  const recipient = await mainSigner.getAddress(); // Sending to self

  const totalTransactions = Math.min(TRANSACTION_AMOUNT, MAX_TRANSACTIONS);
  console.log(`Total transactions to send: ${totalTransactions}`);

  console.log(`Starting to send ${totalTransactions} transactions...`);
  const txPromises = [];

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Private key not found. Set it in your environment variables.");
  }

  const wallet = new ethers.Wallet(privateKey, mainSigner.provider); // Create a Wallet instance
  const walletAddress = await wallet.getAddress();

  const signedTxs = [];
  const gasPrice = (await mainSigner.provider.getFeeData()).gasPrice || ethers.parseUnits("1", "gwei");
  const feeData = await mainSigner.provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits("2", "gwei");
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei");
  
  for (let i = 0; i < totalTransactions; i++) {
    const tx: TransactionRequest = {
      type: 2,
      to: recipient,
      from: walletAddress,
      nonce: currentNonce + i,
      value: AMOUNT_TO_SEND,
      gasLimit: network.config.chainId == 128123 ? 640000 : 21000, // 21000 for general EVM, 640000 for Etherlink
      gasPrice: gasPrice,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
      chainId: network.config.chainId,
    };

    const signed = await wallet.signTransaction(tx); // use the wallet to sign, hardhat prevent it
    signedTxs.push(signed);
  }

  for (const rawTx of signedTxs) {
    txPromises.push(
      mainSigner.provider.broadcastTransaction(rawTx)
    );
  }
  
  await Promise.all(txPromises);

  console.log('All transactions completed');
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });