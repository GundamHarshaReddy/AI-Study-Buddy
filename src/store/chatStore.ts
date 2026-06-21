import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './authStore';
import { ChatMessage, Conversation } from '../types/chat';
import { getChatCompletion, ChatMessage as ApiChatMessage } from '../lib/groq';
import { speakText, stopSpeaking } from '../lib/voice';
import { DocumentChunk, chunkText, searchChunks } from '../lib/rag';

interface ChatState {
  conversations: Conversation[];
  messages: ChatMessage[];
  activeConversationId: string | null;
  isLoading: boolean;
  isDbAvailable: boolean;
  voiceMode: boolean;
  documentChunks: DocumentChunk[];
  uploadedFiles: string[];
  
  fetchConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  toggleMessageFeedback: (id: string, type: 'like' | 'dislike' | 'saved') => void;
  clearActiveChat: () => void;
  toggleVoiceMode: () => void;
  addCompletedTurn: (userContent: string, assistantContent: string) => Promise<void>;
  addDocument: (fileName: string, text: string) => void;
  clearDocuments: () => void;
}

// LocalStorage helpers
const LOCAL_CONVS_KEY = 'ai_study_buddy_conversations';
const LOCAL_MSGS_PREFIX = 'ai_study_buddy_messages_';

const getLocalConversations = (): Conversation[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CONVS_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveLocalConversations = (convs: Conversation[]) => {
  localStorage.setItem(LOCAL_CONVS_KEY, JSON.stringify(convs));
};

const getLocalMessages = (convId: string): ChatMessage[] => {
  try {
    return JSON.parse(localStorage.getItem(`${LOCAL_MSGS_PREFIX}${convId}`) || '[]');
  } catch {
    return [];
  }
};

const saveLocalMessages = (convId: string, msgs: ChatMessage[]) => {
  localStorage.setItem(`${LOCAL_MSGS_PREFIX}${convId}`, JSON.stringify(msgs));
};

const deleteLocalMessages = (convId: string) => {
  localStorage.removeItem(`${LOCAL_MSGS_PREFIX}${convId}`);
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: [],
  activeConversationId: null,
  isLoading: false,
  isDbAvailable: true, // Default to true, will update if query fails
  voiceMode: false,
  documentChunks: [],
  uploadedFiles: [],

  toggleVoiceMode: () => {
    const nextMode = !get().voiceMode;
    if (!nextMode) stopSpeaking();
    set({ voiceMode: nextMode });
  },

  fetchConversations: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    if (get().isDbAvailable) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          // If table doesn't exist (relation code is 42P01 or similar)
          if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
            console.warn('Supabase conversations table not found. Falling back to localStorage.');
            set({ isDbAvailable: false });
          } else {
            throw error;
          }
        } else {
          set({ conversations: data || [] });
          return;
        }
      } catch (err) {
        console.error('Failed to fetch conversations from Supabase:', err);
        set({ isDbAvailable: false });
      }
    }

    // Fallback to localStorage
    const localConvs = getLocalConversations();
    set({ conversations: localConvs });
  },

  selectConversation: async (id: string) => {
    set({ activeConversationId: id, messages: [] });

    if (get().isDbAvailable) {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', id)
          .order('created_at', { ascending: true });

        if (error) {
          throw error;
        } else if (data) {
          const formattedMessages: ChatMessage[] = data.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.created_at).getTime()
          }));
          set({ messages: formattedMessages });
          return;
        }
      } catch (err) {
        console.error('Failed to fetch messages from Supabase:', err);
      }
    }

    // Fallback to localStorage
    const localMsgs = getLocalMessages(id);
    set({ messages: localMsgs });
  },

  createConversation: async (title = 'New Study Session') => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('User not logged in');

    const tempId = crypto.randomUUID();
    const newConv: Conversation = {
      id: tempId,
      title,
      created_at: new Date().toISOString()
    };

    if (get().isDbAvailable) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            title
          })
          .select()
          .single();

        if (error) {
          throw error;
        } else if (data) {
          set((state) => ({
            conversations: [data, ...state.conversations],
            activeConversationId: data.id,
            messages: []
          }));
          return data.id;
        }
      } catch (err) {
        console.error('Failed to create conversation in Supabase:', err);
      }
    }

    // LocalStorage fallback
    const localConvs = getLocalConversations();
    const updatedConvs = [newConv, ...localConvs];
    saveLocalConversations(updatedConvs);
    
    // Add welcome message for new conversation locally
    const welcomeMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: "Hey there! 👋 I'm your AI study buddy - ready to dive into any subject you're curious about! Let's start learning together.",
      timestamp: Date.now()
    };
    saveLocalMessages(tempId, [welcomeMsg]);

    set({
      conversations: updatedConvs,
      activeConversationId: tempId,
      messages: [welcomeMsg]
    });
    return tempId;
  },

  deleteConversation: async (id: string) => {
    if (get().isDbAvailable) {
      try {
        const { error } = await supabase
          .from('conversations')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } catch (err) {
        console.error('Failed to delete conversation in Supabase:', err);
      }
    }

    // Always clean up state & localStorage
    deleteLocalMessages(id);
    const localConvs = getLocalConversations().filter(c => c.id !== id);
    saveLocalConversations(localConvs);

    set((state) => {
      const nextConversations = state.conversations.filter(c => c.id !== id);
      const nextActiveId = state.activeConversationId === id 
        ? (nextConversations[0]?.id || null) 
        : state.activeConversationId;

      return {
        conversations: nextConversations,
        activeConversationId: nextActiveId
      };
    });

    const activeId = get().activeConversationId;
    if (activeId) {
      get().selectConversation(activeId);
    } else {
      set({ messages: [] });
    }
  },

  updateConversationTitle: async (id: string, title: string) => {
    if (get().isDbAvailable) {
      try {
        const { error } = await supabase
          .from('conversations')
          .update({ title })
          .eq('id', id);

        if (error) throw error;
      } catch (err) {
        console.error('Failed to update conversation title in Supabase:', err);
      }
    }

    // Always clean up localStorage
    const localConvs = getLocalConversations().map(c => 
      c.id === id ? { ...c, title } : c
    );
    saveLocalConversations(localConvs);

    set((state) => ({
      conversations: state.conversations.map(c => 
        c.id === id ? { ...c, title } : c
      )
    }));
  },

  sendMessage: async (content: string) => {
    stopSpeaking();
    let activeId = get().activeConversationId;
    
    // Auto-create conversation if none exists
    if (!activeId) {
      activeId = await get().createConversation(
        content.length > 25 ? `${content.substring(0, 25)}...` : content
      );
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    };

    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };

    // Update active list with user message & empty assistant placeholder
    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isLoading: true
    }));

    // Auto rename conversation if it's the first message and has a generic title
    const currentConv = get().conversations.find(c => c.id === activeId);
    if (currentConv && (currentConv.title === 'New Study Session' || currentConv.title === 'New Conversation')) {
      const newTitle = content.length > 30 ? `${content.substring(0, 30)}...` : content;
      get().updateConversationTitle(activeId, newTitle);
    }

    // Search RAG context chunks
    const query = content;
    const documentChunks = get().documentChunks;
    let queryWithContext = query;
    if (documentChunks.length > 0) {
      let matchedChunks = searchChunks(query, documentChunks, 3);
      
      // Fallback: If query keywords did not match anything specific, inject the first 3 chunks as general context
      if (matchedChunks.length === 0) {
        console.log("RAG Search: No keyword match found. Injecting first 3 chunks as fallback.");
        matchedChunks = documentChunks.slice(0, 3);
      }

      console.log("RAG Query:", query, "Matched chunks:", matchedChunks.map(c => c.fileName));

      if (matchedChunks.length > 0) {
        const contextStr = matchedChunks
          .map(c => `[Context from file "${c.fileName}"]: \n"""\n${c.text}\n"""`)
          .join('\n\n');
        queryWithContext = `${contextStr}\n\nUser Question: ${query}\n\nInstructions: Use the provided context to answer the user's question, referencing the file name when citing information.`;
      }
    }

    // Format current message history for Groq API
    const apiMessages: ApiChatMessage[] = get().messages
      .filter(m => m.id !== assistantMessageId)
      .map(m => {
        if (m.id === userMessage.id) {
          return {
            role: m.role,
            content: queryWithContext
          };
        }
        return {
          role: m.role,
          content: m.content
        };
      });

    try {
      let fullResponse = '';
      await getChatCompletion(
        apiMessages,
        (chunk) => {
          fullResponse += chunk;
          set((state) => ({
            messages: state.messages.map(m => 
              m.id === assistantMessageId ? { ...m, content: fullResponse } : m
            )
          }));
        }
      );

      if (get().voiceMode) {
        speakText(fullResponse);
      }

      // Save user message and assistant message to database / localStorage
      const finalAssistantMessage = { ...assistantMessage, content: fullResponse };
      
      if (get().isDbAvailable) {
        try {
          const { error } = await supabase.from('messages').insert([
            { conversation_id: activeId, role: 'user', content: userMessage.content },
            { conversation_id: activeId, role: 'assistant', content: finalAssistantMessage.content }
          ]);
          if (error) {
            console.error('Supabase text messages insert failed:', error.message, error.details, error.hint);
          } else {
            console.log('Supabase text messages insert succeeded!');
          }
        } catch (dbErr) {
          console.error('Error saving messages to database:', dbErr);
        }
      }

      // Always save to local storage as fallback/cache
      const currentLocalMsgs = getLocalMessages(activeId);
      saveLocalMessages(activeId, [...currentLocalMsgs, userMessage, finalAssistantMessage]);

    } catch (err) {
      console.error('Error during chat stream:', err);
      set((state) => ({
        messages: state.messages.map(m => 
          m.id === assistantMessageId 
            ? { ...m, content: 'Sorry, I ran into an error generating that response. Please try again.' } 
            : m
        )
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  toggleMessageFeedback: (id: string, type: 'like' | 'dislike' | 'saved') => {
    set((state) => {
      const updatedMessages = state.messages.map(m => {
        if (m.id !== id) return m;
        
        if (type === 'like') {
          return { ...m, liked: !m.liked, disliked: false };
        } else if (type === 'dislike') {
          return { ...m, disliked: !m.disliked, liked: false };
        } else {
          return { ...m, saved: !m.saved };
        }
      });

      const activeId = state.activeConversationId;
      if (activeId) {
        saveLocalMessages(activeId, updatedMessages);
      }

      return { messages: updatedMessages };
    });
  },

  clearActiveChat: () => {
    set({ activeConversationId: null, messages: [] });
  },

  addCompletedTurn: async (userContent: string, assistantContent: string) => {
    let activeId = get().activeConversationId;
    if (!activeId) {
      activeId = await get().createConversation(
        userContent.length > 25 ? `${userContent.substring(0, 25)}...` : userContent
      );
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      timestamp: Date.now()
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: assistantContent,
      timestamp: Date.now()
    };

    console.log('addCompletedTurn: Syncing messages locally and to database...', { 
      userContent, 
      assistantContent,
      activeId,
      isDbAvailable: get().isDbAvailable,
      messagesBefore: get().messages
    });

    if (get().isDbAvailable) {
      try {
        console.log('addCompletedTurn: Attempting Supabase insert...');
        const { error } = await supabase.from('messages').insert([
          { conversation_id: activeId, role: 'user', content: userContent },
          { conversation_id: activeId, role: 'assistant', content: assistantContent }
        ]);
        if (error) {
          console.error('Supabase messages insert failed:', error.message, error.details, error.hint);
        } else {
          console.log('Supabase messages insert succeeded!');
        }
      } catch (dbErr) {
        console.error('Error saving voice turn to database:', dbErr);
      }
    }

    console.log('addCompletedTurn: Updating Zustand store messages list...');
    set((state) => {
      const newMessages = [...state.messages, userMessage, assistantMessage];
      console.log('addCompletedTurn: Messages after update:', newMessages);
      return { messages: newMessages };
    });

    // Save to local storage cache
    const currentLocalMsgs = getLocalMessages(activeId);
    saveLocalMessages(activeId, [...currentLocalMsgs, userMessage, assistantMessage]);
  },

  addDocument: (fileName: string, text: string) => {
    const newChunks = chunkText(fileName, text);
    set((state) => ({
      documentChunks: [...state.documentChunks, ...newChunks],
      uploadedFiles: [...state.uploadedFiles, fileName]
    }));
  },

  clearDocuments: () => {
    set({ documentChunks: [], uploadedFiles: [] });
  }
}));
