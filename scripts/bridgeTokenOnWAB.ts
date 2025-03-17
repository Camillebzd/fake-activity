import { ethers, network } from 'hardhat';

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

async function main(): Promise<void> {
  // current network
  const networkName = network.name;
  // targeted network
  const targetNetworkName = process.env.targetNetworkName || "";

  const provider = ethers.provider;
  const [mainSigner] = await ethers.getSigners();

  const startingNonce = await mainSigner.getNonce();
  console.log(`Main starting nonce: ${startingNonce}`);

  const Bridge = await ethers.getContractFactory(networkName.slice(0, 9) == 'etherlink' ? 'WrappedTokenBridge' : 'OriginalTokenBridge');
  const bridge = Bridge.attach(bridgeAddresses[networkName]) as any;

  const token = new ethers.Contract(usdcAddresses[networkName], [
    'function approve(address _spender, uint256 _amount) external returns (bool)',
    'function decimals() external view returns (uint8)',
    'function allowance(address, address) external view returns (uint256)',
  ], mainSigner);

  // Estimate bridge fee
  const dstChainId = endpointIds[targetNetworkName];
  const useZro = false;
  // v1 adapterParams, encoded for version 1 style, and 200k gas quote
  let adapterParams = ethers.solidityPacked(
    ['uint16', 'uint256'],
    [
      1,
      // targetNetworkName.slice(0, 9) == 'etherlink' ? 2000000 : 200000
      200000
    ]
  );
  console.log(`bridge address: ${await bridge.getAddress()}`);
  let bridgeFee;
  if (networkName.slice(0, 9) == 'etherlink') {
    bridgeFee = await bridge.estimateBridgeFee(dstChainId, useZro, adapterParams);
  } else {
    bridgeFee = await bridge.estimateBridgeFee(useZro, adapterParams);
  }
  console.log(`Estimated bridge fee: ${ethers.formatUnits(bridgeFee[0], 'ether')} 'ETH'`);


  // Estimate gas for one bridge transaction
  const transactionAmount = 200n;
  // amount is 0.001 USDC
  const amount = ethers.parseUnits('0.001', await token.decimals());
  const callParams = {
    refundAddress: await mainSigner.getAddress(), // refundAddress
    zroPaymentAddress: ethers.ZeroAddress // zroPaymentAddress
  };
  let gasLimit;
  if (networkName.slice(0, 9) == 'etherlink') {
    gasLimit = await bridge.bridge.estimateGas(
      usdcAddresses[networkName],
      endpointIds[targetNetworkName],
      amount,
      await mainSigner.getAddress(),
      false, // unwrap eth
      callParams,
      adapterParams,
      { value: bridgeFee[0] }
    );
  } else {
    gasLimit = await bridge.bridge.estimateGas(
      usdcAddresses[networkName],
      amount,
      await mainSigner.getAddress(),
      callParams,
      adapterParams,
      { value: bridgeFee[0] }
    );
  }

  // /!\ Uncomment to approve the token on the bridge once (max uint)
  // check if allowance is lower than the number of tokens we want to send, if not approve max uint
  const allowance = await token.allowance(await mainSigner.getAddress(), bridgeAddresses[networkName]);
  console.log(`Allowance: ${ethers.formatUnits(allowance, await token.decimals())}`);
  console.log(`Amount: ${ethers.formatUnits(transactionAmount * amount, await token.decimals())}`);
  if (allowance < transactionAmount * amount) {
    const tx = await token.approve(bridgeAddresses[networkName], ethers.MaxUint256);
    await tx.wait();
    console.log(`Approved ${ethers.MaxUint256} tokens to bridge ${bridgeAddresses[networkName]}`);
  }

  // // Get dynamic execution fee
  const feeData = await provider.getFeeData();
  const baseFee = feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"); // Default min 1 gwei
  const maxFeePerGas = baseFee * 2n; // Safe buffer

  console.log(`Estimated gas: ${gasLimit.toString()}`);
  console.log(`Base fee: ${ethers.formatUnits(baseFee, "gwei")} gwei`);
  console.log(`Max fee: ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei`);

  for (let i = 0; i < transactionAmount; i++) {
    console.log(`\nSending bridge transaction ${i + 1}`);
    try {
      if (networkName.slice(0, 9) == 'etherlink') {
        bridge.bridge(
          usdcAddresses[networkName],
          endpointIds[targetNetworkName],
          amount,
          await mainSigner.getAddress(),
          false, // unwrap eth
          callParams,
          adapterParams, 
          { 
            value: bridgeFee[0],
            gasLimit,
            maxFeePerGas,
            nonce: startingNonce + i
          }
        );
      } else {
        bridge.bridge(
          usdcAddresses[networkName],
          amount,
          await mainSigner.getAddress(),
          callParams,
          adapterParams,
          { 
            value: bridgeFee[0],
            gasLimit,
            maxFeePerGas,
            nonce: startingNonce + i
          }
        );
      }
    } catch (error) {
      console.error(`Transaction ${i + 1} failed:`, error);
    }

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