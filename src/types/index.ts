export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  is_active: boolean;
  documentCount?: number;
  created_at: string;
}

export interface Document {
  id: number;
  filename: string;
  file_path: string;
  file_hash: string;
  status: string;
  embedding_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  uploaded_by: string | null;
  created_at: string;
  assignedUsers?: { id: string; name: string }[];
}

export interface ChatbotSettings {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  action: string;
  metadata: any;
  created_at: string;
  userName?: string;
  userEmail?: string;
}
