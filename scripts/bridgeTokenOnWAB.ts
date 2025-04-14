import { ethers, network } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { Account } from '../types/account';
import { Contract, formatEther, formatUnits, parseEther, parseUnits, Provider, Signer, Wallet } from 'ethers';
import { get } from 'http';

// Settings here
const IS_ONLY_MAIN_ACCOUNT = false; // if true, only the main account will send transactions
const TRANSACTION_AMOUNT = 1; // amount of transactions to send per account
const AMOUNT_OF_ACCOUNTS = 1000; // max is 10k from the file atm
const TOKEN_TO_BRIDGE_AMOUNT = '0.0001'; // keep string to let the code deals with decimals

let rpcCallCounter = 0;
const rpcCallHistory: number[] = [];
const RPC_CALLS_PER_MINUTE_LIMIT = 1600;

const TRANSFER_BATCH_SIZE = 50; // Maximum number of transactions per batch

const multicallAddresses: { [key: string]: string } = {
  // Add your multicall addresses here
  sepolia: '0xcA11bde05977b3631167028862bE2a173976CA11',
  // ... other networks
  etherlinkTestnet: '0xcA11bde05977b3631167028862bE2a173976CA11',
  etherlink: '0xcA11bde05977b3631167028862bE2a173976CA11',
}

const endpointIds: { [key: string]: string } = {
  sepolia: '10161',
  bscTestnet: '10102',
  avalancheFujiTestnet: '10106',
  arbitrumSepolia: '10231',
  baseSepolia: '10245',
  optimismSepolia: '10232',
  etherlinkTestnet: '10239',
  etherlink: '292',
  mainnet: '101',
  arbitrumOne: '110',
  base: '184',
  bsc: '102',
  avalanche: '106',
  optimism: '111',
};

const bridgeAddresses: { [key: string]: string } = {
  sepolia: '',
  bscTestnet: '0x544d75a99916CA53394fFc7E0f38c4FE4d08d11b',
  avalancheFujiTestnet: '0x27539c403286750a352798e4646160e7ea284618',
  arbitrumSepolia: '0x1687412b4Cb0f0753BA3919849e729E1bbeC8345',
  baseSepolia: '',
  optimismSepolia: '0x29864554C76b121cd2435962bfaF9AE72D2D5Aaf',
  etherlinkTestnet: '0x137d4e9C2431A3DCBa6e615E9438F2c558353a17',
  etherlink: '0x1f8E735f424B7A49A885571A2fA104E8C13C26c7',
  mainnet: '0x1f8E735f424B7A49A885571A2fA104E8C13C26c7',
  arbitrumOne: '0x1f8E735f424B7A49A885571A2fA104E8C13C26c7',
  base: '0x1f8E735f424B7A49A885571A2fA104E8C13C26c7',
  bsc: '0x1f8E735f424B7A49A885571A2fA104E8C13C26c7',
  avalanche: '0x1f8E735f424B7A49A885571A2fA104E8C13C26c7',
  optimism: '0x1f8E735f424B7A49A885571A2fA104E8C13C26c7',
};

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

// Multicall contract interface
const MULTICALL_ABI = [
  "function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"
];

// Cache for common data
const cache: {
  tokenDecimals?: number;
  bridgeFee?: bigint;
  gasEstimates?: {
    approve?: bigint;
    bridge?: bigint;
  };
  adapterParams?: string;
  maxFeePerGas?: bigint;
  allowances?: Map<string, bigint>;
} = {
  allowances: new Map()
};

// Optimized batch allowance check function that respects rate limits
async function batchCheckAllowances(
  token: Contract,
  accounts: string[],
  bridgeAddress: string
): Promise<Map<string, bigint>> {
  const allowances = new Map<string, bigint>();
  const batchSize = 100; // Check allowances in batches to control RPC rate
  
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batchAccounts = accounts.slice(i, i + batchSize);
    console.log(`Checking allowances batch ${i/batchSize + 1}/${Math.ceil(accounts.length/batchSize)}`);
    
    try {
      // Try multicall first if available
      const provider = ethers.provider;
      const tokenInterface = new ethers.Interface([
        "function allowance(address owner, address spender) view returns (uint256)"
      ]);
      
      const calls = batchAccounts.map(account => ({
        target: token.target as string,
        callData: tokenInterface.encodeFunctionData("allowance", [account, bridgeAddress])
      }));
      
      // Track this as a single RPC call
      await trackRpcCall();
      
      try {
        const networkName = network.name;
        const multicallAddress = multicallAddresses[networkName];
        
        if (multicallAddress) {
          const multicall = new ethers.Contract(
            multicallAddress,
            ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"],
            provider
          );
          
          const [, returnData] = await multicall.aggregate(calls);
          
          batchAccounts.forEach((account, i) => {
            const allowance = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], returnData[i])[0];
            allowances.set(account, allowance);
          });
        } else {
          throw new Error("Multicall not available on this network");
        }
      } catch (error) {
        console.log("Multicall failed, falling back to individual calls");
        // Fall back to individual calls
        const queue = await createRateLimitedQueue(10);
        
        for (const account of batchAccounts) {
          queue.addTask(async () => {
            // This will be tracked by our enhanced provider
            const allowance = await token.allowance(account, bridgeAddress);
            allowances.set(account, allowance);
          });
        }
        
        await queue.waitForAll();
      }
    } catch (error) {
      console.error("Error checking allowances:", error);
    }
    
    // Add a small delay between batches to help with rate limiting
    if (i + batchSize < accounts.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return allowances;
}

// Initialize common data once
async function initializeCommonData(
  networkName: string,
  targetNetworkName: string,
  token: Contract,
  bridge: Contract,
  mainSigner: Signer
): Promise<void> {
  console.log("Initializing common data to reduce RPC calls...");

  // 1. Get token decimals (one-time call)
  if (!cache.tokenDecimals) {
    cache.tokenDecimals = await token.decimals();
    console.log(`Token decimals: ${cache.tokenDecimals}`);
  }

  // 2. Create adapter params (computed locally)
  cache.adapterParams = ethers.solidityPacked(
    ['uint16', 'uint256'],
    [1, 200000]
  );

  // 3. Get bridge fee (one-time call)
  const dstChainId = endpointIds[targetNetworkName];
  const useZro = false;

  if (!cache.bridgeFee) {
    console.log(`Estimating bridge fee for ${networkName} to ${targetNetworkName}`);
    if (networkName.slice(0, 9) == 'etherlink') {
      cache.bridgeFee = (await bridge.estimateBridgeFee(dstChainId, useZro, cache.adapterParams))[0];
    } else {
      cache.bridgeFee = (await bridge.estimateBridgeFee(useZro, cache.adapterParams))[0];
    }
    console.log(`Estimated bridge fee: ${ethers.formatUnits(cache.bridgeFee || 0, 'ether')} ETH`);
  }

  // 4. Get gas fee data (one-time call with periodic refresh)
  const feeData = await ethers.provider.getFeeData();
  const baseFee = feeData.maxFeePerGas || ethers.parseUnits("1", "gwei");
  cache.maxFeePerGas = baseFee * 2n;
  console.log(`Max fee per gas: ${ethers.formatUnits(cache.maxFeePerGas, "gwei")} gwei`);

  // 5. Estimate gas for operations (one-time calls)
  if (!cache.gasEstimates) {
    cache.gasEstimates = {};

    // Amount to bridge/approve
    const amount = ethers.parseUnits(TOKEN_TO_BRIDGE_AMOUNT, cache.tokenDecimals);

    // Estimate approve gas (one-time)
    console.log("Estimating approval gas...");
    cache.gasEstimates.approve = await token.approve.estimateGas(
      bridgeAddresses[networkName],
      amount
    ) * 2n; // Safety buffer

    // Estimate bridge gas (one-time)
    console.log("Estimating bridge gas...");
    const mainSignerAddress = await mainSigner.getAddress();
    const callParams = {
      refundAddress: mainSignerAddress,
      zroPaymentAddress: ethers.ZeroAddress
    };

    try {
      if (networkName.slice(0, 9) == 'etherlink') {
        cache.gasEstimates.bridge = await bridge.bridge.estimateGas(
          usdcAddresses[networkName],
          endpointIds[targetNetworkName],
          amount,
          mainSignerAddress,
          false, // unwrap eth
          callParams,
          cache.adapterParams,
          { value: cache.bridgeFee }
        ) * 2n; // Safety buffer
      } else {
        cache.gasEstimates.bridge = await bridge.bridge.estimateGas(
          usdcAddresses[networkName],
          amount,
          mainSignerAddress,
          callParams,
          cache.adapterParams,
          { value: cache.bridgeFee }
        ) * 2n; // Safety buffer
      }
    } catch (error) {
      console.error("Bridge gas estimation failed, using default:", error);
      cache.gasEstimates.bridge = 300000n; // Default fallback gas limit
    }

    console.log(`Gas estimates - Approve: ${cache.gasEstimates.approve}, Bridge: ${cache.gasEstimates.bridge}`);
  }
}

// Modified approveBridgeIfNeeded function
async function approveBridgeIfNeeded(
  user: Signer,
  token: any,
  bridgeAddress: string,
  amount: bigint,
  allowancesMap: Map<string, bigint>
): Promise<string | undefined> {
  const userAddress = await user.getAddress();
  
  // Use cached allowance or fetch it
  let allowance = allowancesMap.get(userAddress);
  if (allowance === undefined) {
    // This will be rate-limited by our enhanced provider
    allowance = await token.allowance(userAddress, bridgeAddress);
    if (allowance === undefined) {
      console.error(`Failed to fetch allowance for user ${userAddress}`);
      return undefined;
    }
    allowancesMap.set(userAddress, allowance);
  }

  if (allowance < BigInt(TRANSACTION_AMOUNT) * amount) {
    try {
      const tx = await token.connect(user).approve(bridgeAddress, amount, {
        maxFeePerGas: cache.maxFeePerGas,
        gasLimit: cache.gasEstimates?.approve
      });
      
      await tx.wait();
      console.log(`User ${userAddress} approved ${amount} tokens to bridge ${bridgeAddress}`);
      
      // Update the cache
      allowancesMap.set(userAddress, amount);
      
      return tx.hash;
    } catch (error) {
      console.error(`Approval transaction failed for user ${userAddress}:`, error);
      return undefined;
    }
  }
  return "0x"; // No approval needed
}

// Bridge tokens
async function bridgeTokenOnWAB(
  networkName: string,
  targetNetworkName: string,
  bridge: any,
  amount: bigint,
  user: Signer,
): Promise<string | undefined> {
  const userAddress = await user.getAddress();
  console.log(`Bridging ${amount} tokens from ${networkName} to ${targetNetworkName} with user ${userAddress}...`);

  try {
    const callParams = {
      refundAddress: userAddress,
      zroPaymentAddress: ethers.ZeroAddress
    };

    let tx;
    if (networkName.slice(0, 9) == 'etherlink') {
      tx = await bridge.connect(user).bridge(
        usdcAddresses[networkName],
        endpointIds[targetNetworkName],
        amount,
        userAddress,
        false, // unwrap eth
        callParams,
        cache.adapterParams,
        {
          value: cache.bridgeFee,
          gasLimit: cache.gasEstimates?.bridge,
          maxFeePerGas: cache.maxFeePerGas,
        }
      );
    } else {
      tx = await bridge.connect(user).bridge(
        usdcAddresses[networkName],
        amount,
        userAddress,
        callParams,
        cache.adapterParams,
        {
          value: cache.bridgeFee,
          gasLimit: cache.gasEstimates?.bridge,
          maxFeePerGas: cache.maxFeePerGas,
        }
      );
    }

    await tx.wait();
    console.log(`User ${userAddress} bridged ${TOKEN_TO_BRIDGE_AMOUNT} tokens`);
    return tx.hash;
  } catch (error) {
    console.error(`Bridging transaction failed for user ${userAddress}:`, error);
    return undefined;
  }
}

// Improved rate limited queue for transactions
async function createRateLimitedQueue(maxConcurrent = 10) {
  const queue: Array<() => Promise<any>> = [];
  let processing = false;
  let activeRequests = 0;
  
  // Process the next item in the queue
  const processQueue = async () => {
    if (processing || queue.length === 0 || activeRequests >= maxConcurrent) return;
    
    processing = true;
    
    try {
      while (queue.length > 0 && activeRequests < maxConcurrent) {
        const task = queue.shift();
        if (!task) break;
        
        activeRequests++;
        
        // Execute the task but don't wait for it to complete
        task().finally(() => {
          activeRequests--;
          setImmediate(processQueue); // Continue processing after task completes
        });
      }
    } finally {
      processing = false;
    }
  };

  return {
    addTask: (task: () => Promise<any>) => {
      const wrappedTask = async () => {
        try {
          return await task();
        } catch (error) {
          console.error("Task failed:", error);
          throw error;
        }
      };

      queue.push(wrappedTask);
      setImmediate(processQueue);
      return queue.length;
    },
    waitForAll: async () => {
      while (queue.length > 0 || activeRequests > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },
    getStats: () => ({
      queueLength: queue.length,
      activeRequests,
      totalRpcCalls: rpcCallCounter,
      currentRpcRate: rpcCallHistory.length
    })
  };
}

// Optimized batch processing
async function processBatch(
  wallets: Wallet[],
  operation: (wallet: Wallet) => Promise<string | undefined>,
  batchName: string
): Promise<void> {
  const queue = await createRateLimitedQueue();
  const totalWallets = wallets.length;
  const batches = Math.ceil(totalWallets / TRANSFER_BATCH_SIZE);

  console.log(`Processing ${totalWallets} ${batchName} operations in ${batches} batches...`);

  let completed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < batches; i++) {
    const start = i * TRANSFER_BATCH_SIZE;
    const end = Math.min(start + TRANSFER_BATCH_SIZE, totalWallets);
    const batchWallets = wallets.slice(start, end);

    console.log(`Starting batch ${i + 1}/${batches} (${batchWallets.length} wallets)`);

    const batchPromises = batchWallets.map(wallet => {
      return new Promise<void>(resolve => {
        queue.addTask(async () => {
          try {
            const result = await operation(wallet);
            if (result) {
              succeeded++;
              if (result !== "0x") {
                console.log(`✓ ${batchName} succeeded for wallet: ${wallet.address.substring(0, 10)}...`);
              }
            } else {
              failed++;
              console.log(`✗ ${batchName} failed for wallet: ${wallet.address.substring(0, 10)}...`);
            }
          } catch (error) {
            failed++;
            console.error(`Error in ${batchName} for wallet: ${wallet.address.substring(0, 10)}...`, error);
          } finally {
            completed++;
            resolve();
          }
        });
      });
    });
    console.log(`Stats: ${queue.getStats()}`);


    // Wait for current batch to complete
    await Promise.all(batchPromises);

    console.log(`Batch ${i + 1}/${batches} completed - Progress: ${completed}/${totalWallets} (${succeeded} succeeded, ${failed} failed)`);

    // Short pause between batches to let rate limiter adjust
    if (i < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Wait for any remaining tasks
  await queue.waitForAll();
  console.log(`All ${batchName} operations completed - ${succeeded}/${totalWallets} succeeded, ${failed}/${totalWallets} failed`);
}

// RPC call tracker that you can use before any provider call
async function trackRpcCall(): Promise<void> {
  const now = Date.now();

  // Remove timestamps older than 1 minute
  while (rpcCallHistory.length > 0 && rpcCallHistory[0] < now - 60000) {
    rpcCallHistory.shift();
  }

  // Check if we're at the limit
  if (rpcCallHistory.length >= RPC_CALLS_PER_MINUTE_LIMIT) {
    const oldestCall = rpcCallHistory[0];
    const waitTime = 60000 - (now - oldestCall) + 100; // Add small buffer
    console.log(`RPC rate limit reached (${rpcCallHistory.length} calls). Waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return trackRpcCall(); // Recheck after waiting
  }

  // Track this call
  rpcCallCounter++;
  rpcCallHistory.push(now);
}

// Enhanced provider that automatically tracks RPC calls
function createEnhancedProvider(provider: any) {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original === 'function') {
        return async function (...args: any[]) {
          // For methods that make RPC calls
          const rpcMethods = [
            'call', 'estimateGas', 'getBalance', 'getCode', 'getGasPrice',
            'getTransactionCount', 'getTransaction', 'getTransactionReceipt',
            'send', 'sendTransaction', 'getBlock', 'getFeeData', 'getBlockNumber'
          ];

          // if (rpcMethods.includes(prop.toString())) {
          //   await trackRpcCall();
          // }
          await trackRpcCall();
          // console.log(`RPC call "${prop.toString()}" with args: ${args.join(', ')}`);

          return original.apply(target, args);
        };
      }

      return original;
    }
  }) as typeof provider;
}

async function main(): Promise<void> {
  const networkName = network.name;
  const targetNetworkName = process.env.targetNetworkName || "";

  console.log(`Starting optimized bridge script from ${networkName} to ${targetNetworkName}`);

  const enhancedProvider = createEnhancedProvider(ethers.provider);
  (ethers as any).provider = enhancedProvider;

  // Get signers and accounts
  const [mainSigner] = await ethers.getSigners();
  const accountsPath = path.join(__dirname, '..', 'accounts/generated-accounts.json');
  const accounts = (JSON.parse(fs.readFileSync(accountsPath, 'utf-8')) as Account[]).slice(0, AMOUNT_OF_ACCOUNTS);

  // Contract setup
  const token = new ethers.Contract(usdcAddresses[networkName], [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ], mainSigner);

  const Bridge = await ethers.getContractFactory(networkName.slice(0, 9) == 'etherlink' ? 'WrappedTokenBridge' : 'OriginalTokenBridge');
  const bridge = Bridge.attach(bridgeAddresses[networkName]) as any;

  // Initialize common data to minimize RPC calls
  await initializeCommonData(networkName, targetNetworkName, token, bridge, mainSigner);

  const amount = ethers.parseUnits(TOKEN_TO_BRIDGE_AMOUNT, cache.tokenDecimals!);

  // Setup wallets
  const wallets = IS_ONLY_MAIN_ACCOUNT
    ? [mainSigner as unknown as Wallet]
    : accounts.map(account => new Wallet(account.privateKey, enhancedProvider));

  // Batch check allowances for all wallets at once
  console.log("Checking allowances in batch...");
  const walletAddresses = await Promise.all(wallets.map(w => w.getAddress()));
  cache.allowances = await batchCheckAllowances(token, walletAddresses, bridgeAddresses[networkName]);

  if (cache.allowances.size !== wallets.length || !cache.allowances) {
    throw new Error("Failed to fetch all allowances");
  }

  // Approval process
  console.log("Starting approval process - tracking RPC calls");

  await processBatch(
    wallets,
    async (wallet) => approveBridgeIfNeeded(wallet, token, bridgeAddresses[networkName], amount, cache.allowances!),
    "approvals"
  );

  // Bridge process
  console.log("Starting bridge process - tracking RPC calls");

  await processBatch(
    wallets,
    async (wallet) => {
      return bridgeTokenOnWAB(
        networkName,
        targetNetworkName,
        bridge,
        amount,
        wallet
      );
    },
    "bridge"
  );

  // Restore original provider
  // (ethers as any).provider = originalProvider;

  console.log('\nAll operations completed');
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });