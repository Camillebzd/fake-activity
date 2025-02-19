export interface Account {
  address: string;
  privateKey: string;
}

export interface TransactionResult {
  address: string;
  hash?: string;
  error?: string;
}