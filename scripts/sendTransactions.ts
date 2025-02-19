import { ethers } from 'hardhat';
import { parseEther, formatEther, Wallet, Provider, Signer, Contract } from 'ethers';
import fs from 'fs';
import path from 'path';
import { Account } from '../types/account';

const FUNDING_AMOUNT = parseEther('0.001');
const TRANSFER_AMOUNT = parseEther('0.001');
const TRANSFER_BATCH_SIZE = 100;
const MULTICALL_BATCH_SIZE = 200; // Maximum number of addresses per multicall

// Replace with your deployed Multicall contract address
const MULTICALL_ADDRESS = "0xaD8B3b3B10e86960cdB66744bf99477d28cB6362";
const MULTICALL_ABI = [
  "function multiCall(address[] calldata targets, uint256[] calldata values, bytes[] calldata data) payable returns (bool[] memory)"
];

async function estimateGasOnce(
  from: string,
  to: string,
  value: bigint,
  provider: Provider
): Promise<bigint> {
  const txRequest = { from, to, value };
  const gasEstimate = await provider.estimateGas(txRequest);
  return (gasEstimate * 120n) / 100n;
}

async function processMulticallBatch(
  accounts: Account[],
  startIdx: number,
  batchSize: number,
  multicall: Contract,
  batchNumber: number,
  totalBatches: number,
  currentNonce: number
): Promise<void> {
  const endIdx = Math.min(startIdx + batchSize, accounts.length);
  const batchAccounts = accounts.slice(startIdx, endIdx);

  const targets = batchAccounts.map(account => account.address);
  const values = batchAccounts.map(() => FUNDING_AMOUNT);
  const data = batchAccounts.map(() => "0x");

  const totalValue = FUNDING_AMOUNT * BigInt(batchAccounts.length);

  console.log(`\nProcessing funding batch ${batchNumber}/${totalBatches}`);
  console.log(`Accounts in batch: ${targets.length}`);
  console.log(`Total value for batch: ${formatEther(totalValue)} ETH`);

  try {
    if (startIdx > 0) {
      // estimate gas 
      let gasLimit = await multicall.multiCall.estimateGas(targets, values, data, {
        value: totalValue
      });
      // add 10% buffer
      gasLimit = (gasLimit * 110n) / 100n;
      console.log(`Estimated gas for batch ${batchNumber}: ${gasLimit.toString()}`);
      // hardcoded gas limit for the multicall transaction
      // const tx = await multicall.multiCall(targets, values, data, {
      //   value: totalValue,
      //   gasLimit
      // });
      // console.log(`Multicall transaction sent: ${tx.hash}`);
      multicall.multiCall(targets, values, data, {
        value: totalValue,
        nonce: currentNonce
      });
      console.log(`Multicall transaction sent.`);
      // await tx.wait();
    } else {
      // hardcoded gas limit for the multicall transaction
      // const tx = await multicall.multiCall(targets, values, data, {
      //   value: totalValue,
      // });
      // console.log(`Multicall transaction sent: ${tx.hash}`);
      multicall.multiCall(targets, values, data, {
        value: totalValue,
        nonce: currentNonce
      });
      console.log(`Multicall transaction sent.`);
      await new Promise(resolve => setTimeout(resolve, 300));
      // await tx.wait();
    }
    console.log(`Batch ${batchNumber} funding completed`);
  } catch (error) {
    console.error(`Error in multicall batch ${batchNumber}:`, error);
    throw error;
  }
}

async function fundAccountsWithMulticall(
  accounts: Account[],
  mainSigner: Signer,
  multicallAddress: string
): Promise<void> {
  if (!mainSigner.provider) {
    throw new Error('Signer must be connected to a provider');
  }

  const multicall = new Contract(multicallAddress, MULTICALL_ABI, mainSigner);
  const totalBatches = Math.ceil(accounts.length / MULTICALL_BATCH_SIZE);

  console.log(`\nFunding ${accounts.length} accounts via Multicall in ${totalBatches} batches`);
  const totalValue = FUNDING_AMOUNT * BigInt(accounts.length);
  console.log(`Total value to be sent: ${formatEther(totalValue)} ETH`);
  const startingNonce = await mainSigner.getNonce();
  console.log(`Starting nonce: ${startingNonce}`);

  for (let i = 0; i < accounts.length; i += MULTICALL_BATCH_SIZE) {
    const batchNumber = Math.floor(i / MULTICALL_BATCH_SIZE) + 1;
    const currentNonce = startingNonce + batchNumber - 1;

    await processMulticallBatch(
      accounts,
      i,
      MULTICALL_BATCH_SIZE,
      multicall,
      batchNumber,
      totalBatches,
      currentNonce
    );

    // Small delay between batches
    if (batchNumber < totalBatches) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function sendTransactionBatch(
  transactions: Array<() => Promise<string>>,
  batchIndex: number,
  totalBatches: number
): Promise<void> {
  console.log(`Starting batch ${batchIndex + 1}/${totalBatches}`);

  const promises = transactions.map(tx => {
    return tx().catch(error => {
      console.error('Transaction failed:', error);
      return null;
    });
  });

  const firstTxHash = await promises[0];
  if (firstTxHash) {
    console.log(`First transaction in batch ${batchIndex + 1} sent: ${firstTxHash}`);
  }

  Promise.all(promises).then(results => {
    const successful = results.filter(r => r !== null).length;
    console.log(`Batch ${batchIndex + 1} completed - ${successful}/${transactions.length} successful`);
  });

  if (batchIndex < totalBatches - 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function transferBetweenAccountsParallel(
  accounts: Account[],
  provider: Provider,
  precomputedGas: bigint
): Promise<void> {
  const wallets = accounts.map(account => new Wallet(account.privateKey, provider));

  const nonces = await Promise.all(
    wallets.map(wallet => provider.getTransactionCount(wallet.address))
  );

  const allTransactions = accounts.map((_, index) => {
    const wallet = wallets[index];
    const recipientIndex = (index + 1) % accounts.length;
    const recipient = accounts[recipientIndex].address;
    let currentNonce = nonces[index];

    return async () => {
      const tx = await wallet.sendTransaction({
        to: recipient,
        value: TRANSFER_AMOUNT,
        gasLimit: precomputedGas,
        nonce: currentNonce++
      });
      return tx.hash;
    };
  });

  const batches = Math.ceil(allTransactions.length / TRANSFER_BATCH_SIZE);
  for (let i = 0; i < batches; i++) {
    const start = i * TRANSFER_BATCH_SIZE;
    const end = Math.min(start + TRANSFER_BATCH_SIZE, allTransactions.length);
    const batch = allTransactions.slice(start, end);

    await sendTransactionBatch(batch, i, batches);
  }
}

async function main(): Promise<void> {
  const accountsPath = path.join(__dirname, '../accounts/generated-accounts.json');
  if (!fs.existsSync(accountsPath)) {
    throw new Error('Generated accounts file not found. Run generateAccounts.ts first.');
  }

  const accounts: Account[] = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
  const provider = await ethers.provider;
  const [mainSigner] = await ethers.getSigners();

  const network = await provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

  console.log('\nStep 1: Funding accounts via Multicall...');
  await fundAccountsWithMulticall(accounts, mainSigner, MULTICALL_ADDRESS);

  console.log('\nWaiting for funding to be confirmed...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  const transferGas = await estimateGasOnce(
    accounts[0].address,
    accounts[1].address,
    TRANSFER_AMOUNT,
    provider
  );

  console.log('\nStep 2: Performing transfers between accounts...');
  await transferBetweenAccountsParallel(accounts, provider, transferGas);

  console.log('\nAll operations completed');
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });