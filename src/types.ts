export interface Alert {
  id?: string; // Gmail Message ID (useful for duplicate checking)
  subject: string;
  sender: string;
  originalDate: string; // The date as stated in the email or news
  processedDate: string; // Date checked/processed
  content: string; // Cleaned description or summary
  newsUrl: string; // Extracted news article URL or source
  otherData: string; // Any other structured facts extracted from the alert
  sentiment?: string; // Tonal feedback (Positivo, Neutral, Negativo)
  status: 'pending' | 'success' | 'duplicate' | 'error';
  statusDetails?: string;
  rowNumber?: number; // Row position in Google Sheets
}

export interface SyncLog {
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  totalFound: number;
  newAdded: number;
  duplicatesIgnored: number;
  errorsCount: number;
  lastSyncTime?: string;
  logs: SyncLog[];
}

export interface SyncConfig {
  spreadsheetId: string;
  sheetName: string;
  searchQuery: string;
  onlyToday: boolean;
}
