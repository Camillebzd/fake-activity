// scripts/generateAccounts.ts
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { Account } from '../types/account';

async function main(): Promise<void> {
  const accounts: Account[] = [];
  const NUM_ACCOUNTS = 10000;

  // Generate new accounts
  for (let i = 0; i < NUM_ACCOUNTS; i++) {
    const wallet = ethers.Wallet.createRandom();
    accounts.push({
      address: wallet.address,
      privateKey: wallet.privateKey
    });
  }

  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, '../accounts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Write accounts to file
  const outputPath = path.join(outputDir, 'generated-accounts.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(accounts, null, 2)
  );

  console.log(`Generated ${accounts.length} accounts and saved to ${outputPath}`);
  console.log('Addresses:');
  accounts.forEach((acc: Account, index: number) => {
    console.log(`${index + 1}. ${acc.address}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });