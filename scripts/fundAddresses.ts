import { ethers, network } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { Account } from '../types/account';
import { Contract, formatEther, formatUnits, parseEther, parseUnits, Signer } from 'ethers';

const MULTICALL_ADDRESS = "0xaD8B3b3B10e86960cdB66744bf99477d28cB6362";
const MULTICALL_ABI = [
  "function multiCall(address[] calldata targets, uint256[] calldata values, bytes[] calldata data) payable returns (bool[] memory)"
];

// Settings here
const FUND_ERC20 = true; // If yes then fund in ERC20 token, if no then fund gas token only
const AMOUNT_OF_ACCOUNTS = 1000; // max is 10k from the file atm
const GAS_FUNDING_AMOUNT = parseEther('0.01'); // amount of gas token
const TOKEN_FUNDING_AMOUNT = "1"; // amount of testnet token, use string to let the code deals with decimals

const MULTICALL_BATCH_SIZE = 100; // Maximum number of addresses per multicall
const TIMESTAMPS_BETWEEN_BATCHES = 500; // Time in milliseconds between multicall batches

const usdcAddresses: { [key: string]: string } = {
  sepolia: '',
  bscTestnet: '0x89A44C4fa11630E11425c177cE08828179A249A6',
  avalancheFujiTestnet: '0x2Dbc0f2b6F5707879329cc3104eE430de4c1ACa9',
  arbitrumSepolia: '0x137d4e9C2431A3DCBa6e615E9438F2c558353a17',
  baseSepolia: '',
  optimismSepolia: '0x137d4e9C2431A3DCBa6e615E9438F2c558353a17',
  etherlinkTestnet: '0xc92eaA8bb3B267C3c2553e1596807c7B847192A1',
  etherlink: '0x796Ea11Fa2dD751eD01b53C372fFDB4AAa8f00F9',
  mainnet: '',
  arbitrumOne: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  bsc: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  avalanche: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
};

interface MulticallOptions {
  useERC20?: boolean;  // Flag to determine if we're sending ERC20 tokens
  erc20Address?: string; // The address of the ERC20 token contract
  erc20Amount?: string; // Amount of ERC20 tokens to send per account (in token units)
  erc20Decimals?: number; // Decimals of the ERC20 token
}

// Function to approve the multicall contract to spend tokens
async function approveMulticall(
  erc20Token: Contract,
  multicallAddress: string,
  accounts: Account[],
  tokenAmount: string,
  decimals: number
): Promise<void> {
  // Calculate total amount needed for all transfers
  const totalAccounts = accounts.length;
  const amountPerAccount = parseUnits(tokenAmount, decimals);
  const totalAmount = amountPerAccount * BigInt(totalAccounts);

  console.log(`\nApproving multicall contract to spend ${formatUnits(totalAmount, decimals)} tokens...`);

  try {
    const tx = await erc20Token.approve(multicallAddress, totalAmount);
    console.log(`Approval transaction hash: ${tx.hash}`);
    await tx.wait();
    console.log(`Approval confirmed.`);
  } catch (error) {
    console.error(`Error approving tokens:`, error);
    throw error;
  }
}

async function processMulticallBatch(
  senderAddress: string,
  accounts: Account[],
  startIdx: number,
  batchSize: number,
  multicall: Contract,
  erc20Token: Contract | null, // ERC20 token contract
  batchNumber: number,
  totalBatches: number,
  currentNonce: number,
  options: MulticallOptions = {}
): Promise<void> {
  const endIdx = Math.min(startIdx + batchSize, accounts.length);
  const batchAccounts = accounts.slice(startIdx, endIdx);
  const targets: string[] = [];
  const values: bigint[] = [];
  const data: string[] = [];

  // Default to native token transfer if not specified
  const useERC20 = options.useERC20 || false;
  let totalValue = BigInt(0);

  if (useERC20 && erc20Token && options.erc20Address && options.erc20Amount) {
    // For ERC20 transfers, the target is always the ERC20 contract
    const tokenAmount = parseUnits(options.erc20Amount, options.erc20Decimals || 18);

    // Create ERC20 transfer calls for each recipient
    for (const account of batchAccounts) {
      targets.push(options.erc20Address);
      values.push(BigInt(0)); // No ETH is sent with ERC20 transfers

      // Encode the transfer function call
      const transferData = erc20Token.interface.encodeFunctionData(
        'transferFrom',
        [senderAddress, account.address, tokenAmount]
      );
      data.push(transferData);
    }

    console.log(`\nProcessing ERC20 token transfer batch ${batchNumber}/${totalBatches}`);
    console.log(`Sending ${options.erc20Amount} tokens to ${batchAccounts.length} accounts`);
  } else {
    // Original native token transfer logic
    for (const account of batchAccounts) {
      targets.push(account.address);
      values.push(GAS_FUNDING_AMOUNT);
      data.push("0x");
    }

    totalValue = GAS_FUNDING_AMOUNT * BigInt(batchAccounts.length);

    console.log(`\nProcessing native token funding batch ${batchNumber}/${totalBatches}`);
    console.log(`Accounts in batch: ${targets.length}`);
    console.log(`Total value for batch: ${formatEther(totalValue)} ETH`);
  }

  try {
    await multicall.multiCall(targets, values, data, {
      value: totalValue,
      nonce: currentNonce
    });
    console.log(`Multicall transaction sent.`);
    console.log(`Batch ${batchNumber} ${useERC20 ? 'token transfer' : 'funding'} completed`);
  } catch (error) {
    console.error(`Error in multicall batch ${batchNumber}:`, error);
    throw error;
  }
}

async function fundAccountsWithMulticall(
  accounts: Account[],
  mainSigner: Signer,
  erc20: Contract,
): Promise<void> {
  if (!mainSigner.provider) {
    throw new Error('Signer must be connected to a provider');
  }

  const multicall = new Contract(MULTICALL_ADDRESS, MULTICALL_ABI, mainSigner);
  const totalBatches = Math.ceil(accounts.length / MULTICALL_BATCH_SIZE);

  const erc20Address = await erc20.getAddress();
  const decimals = await erc20.decimals();

  if (FUND_ERC20) {
    const currentAllowance = await erc20.allowance(await mainSigner.getAddress(), MULTICALL_ADDRESS);
    const requiredAllowance = parseUnits(TOKEN_FUNDING_AMOUNT, decimals) * BigInt(accounts.length);

    if (currentAllowance < requiredAllowance) {
      await approveMulticall(erc20, MULTICALL_ADDRESS, accounts, TOKEN_FUNDING_AMOUNT, decimals);
    } else {
      console.log(`\nMulticall already has sufficient allowance (${formatUnits(currentAllowance, decimals)} tokens).`);
    }
  }

  console.log(`\nFunding ${accounts.length} accounts via Multicall in ${totalBatches} batches`);
  const totalValue = GAS_FUNDING_AMOUNT * BigInt(accounts.length);
  console.log(`Total value to be sent: ${formatEther(totalValue)} ETH`);

  const startingNonce = await mainSigner.getNonce();
  let currentNonce = startingNonce;
  console.log(`Starting nonce: ${startingNonce}`);

  const senderAddress = await mainSigner.getAddress();

  for (let i = 0; i < accounts.length; i += MULTICALL_BATCH_SIZE) {
    const batchNumber = Math.floor(i / MULTICALL_BATCH_SIZE) + 1;

    // native token transfer
    // no await to go faster
    processMulticallBatch(
      senderAddress,
      accounts,
      i,
      MULTICALL_BATCH_SIZE,
      multicall,
      erc20,
      Math.floor(i / MULTICALL_BATCH_SIZE) + 1,
      Math.ceil(accounts.length / MULTICALL_BATCH_SIZE),
      currentNonce
    );
    currentNonce++;

    // ERC20 token transfer
    if (FUND_ERC20) {
      // no await to go faster
      processMulticallBatch(
        senderAddress,
        accounts,
        i,
        MULTICALL_BATCH_SIZE,
        multicall,
        erc20,
        Math.floor(i / MULTICALL_BATCH_SIZE) + 1,
        Math.ceil(accounts.length / MULTICALL_BATCH_SIZE),
        currentNonce,
        {
          useERC20: true,
          erc20Address: erc20Address,
          erc20Amount: TOKEN_FUNDING_AMOUNT,
          erc20Decimals: decimals
        }
      );
      currentNonce++;
    }

    // Small delay between batches
    if (batchNumber < totalBatches) {
      await new Promise(resolve => setTimeout(resolve, TIMESTAMPS_BETWEEN_BATCHES));
    }
  }
  console.log(`\nAmount of transactions sent: ${totalBatches * 2}`);
  console.log(`\nFunding complete.`);
}

async function main(): Promise<void> {
  // current network
  const networkName = network.name;

  const [mainSigner] = await ethers.getSigners();

  // for the moment we only support USDC token funding
  const token = new ethers.Contract(usdcAddresses[networkName], [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ], mainSigner);

  const accountsPath = path.join(__dirname, '..', 'accounts/generated-accounts.json');
  const accounts = (JSON.parse(fs.readFileSync(accountsPath, 'utf-8')) as Account[]).slice(0, AMOUNT_OF_ACCOUNTS);

  await fundAccountsWithMulticall(accounts, mainSigner, token);
  return;
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });