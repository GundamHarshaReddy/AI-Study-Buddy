import { create } from 'zustand';
import { ChatMessage } from '../types/chat';
import { getChatCompletion } from '../lib/groq';

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (role: ChatMessage['role'], content: string) => string;
  updateMessage: (id: string, content: string) => void;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  addMessage: (role, content) => {
    const id = crypto.randomUUID();
    const message = {
      id,
      role,
      content,
      timestamp: Date.now(),
    };
    
    set((state) => ({
      messages: [...state.messages, message],
    }));
    return id;
  },
  updateMessage: (id, content) => set((state) => ({
    messages: state.messages.map((msg) =>
      msg.id === id && msg.role === 'assistant'
        ? {
            ...msg,
            content: content
              .replace(/^AI:\s*/g, '')
              .replace(/^\*.*?\*\s*/gm, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
          }
        : msg
    ),
  })),
  sendMessage: async (content: string) => {
    set({ isLoading: true });
    const currentState = get();
    
    try {
      currentState.addMessage('user', content);
      const assistantMessageId = currentState.addMessage('assistant', '');
      
      const groqMessages = currentState.messages
        .filter(msg => msg.id !== assistantMessageId)
        .map(msg => ({
          role: msg.role,
          content: msg.content.trim(),
        }))
        .filter(msg => msg.content.length > 0);
      
      let responseText = '';
      await getChatCompletion(
        groqMessages,
        (chunk) => {
          const cleanChunk = chunk
            .replace(/^AI:\s*/g, '')
            .replace(/^\*.*?\*\s*/gm, '')
            .trim();
          responseText += cleanChunk;
          currentState.updateMessage(assistantMessageId, responseText);
        }
      );
    } catch (error) {
      console.error('Chat completion error:', error);
      currentState.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    } finally {
      set({ isLoading: false });
    }
  },
  clearMessages: () => set({ messages: [] }),
}));
