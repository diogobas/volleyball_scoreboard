export interface MatchUploadReceipt {
  status: 'received' | 'already_received' | 'not_local';
  deleted?: boolean;
  published?: boolean;
}

export interface MatchUploadState {
  state: 'sending' | 'failed' | 'interrupted';
  error?: string;
  attemptedAt?: string;
}
