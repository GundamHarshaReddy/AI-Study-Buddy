export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  liked?: boolean;
  disliked?: boolean;
  saved?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
}
