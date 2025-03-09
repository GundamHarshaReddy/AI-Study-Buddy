import { useState, useRef, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { Send, Trash2, Loader2, Moon, Sun, MessageSquare, Save, Settings, History, User, LogOut, X, ThumbsUp, ThumbsDown, Copy, Bookmark } from 'lucide-react';
import { getChatCompletion, ChatMessage as ApiChatMessage } from '../lib/groq';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import ReactMarkdown from 'react-markdown';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark as atomDark, github } from 'react-syntax-highlighter/dist/esm/styles/hljs';

// Internal Chat Context to replace external store
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  liked?: boolean;
  disliked?: boolean;
  saved?: boolean;
}

interface ChatContextType {
  messages: Message[];
  isLoading: boolean;
  addMessage: (role: 'user' | 'assistant', content: string) => string;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  conversationTitle: string;
  setConversationTitle: (title: string) => void;
  savedConversations: { id: string, title: string, date: Date }[];
  saveCurrentConversation: () => string | null;
}

const ChatContext = createContext<ChatContextType | null>(null);

const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationTitle, setConversationTitle] = useState('New Conversation');
  const [savedConversations, setSavedConversations] = useState<{ id: string, title: string, date: Date }[]>([]);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Add welcome message on initial load
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage = {
        id: 'welcome-' + Date.now().toString(),
        role: 'assistant' as const,
        content: "Hey there! 👋 I'm your AI study buddy - ready to dive into any subject you're curious about! Whether you want to chat first or jump straight into learning, I'm here for you. What's on your mind?",
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const newMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    try {
      const userId = Date.now().toString();
      // Add user message
      setMessages(prev => [
        ...prev, 
        {
          id: userId,
          role: 'user',
          content,
          timestamp: new Date(),
        }
      ]);
      
      setIsLoading(true);

      // Add empty assistant message to display typing indicator
      const assistantId = (Date.now() + 1).toString();
      
      setMessages(prev => [
        ...prev, 
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        }
      ]);

      // Set conversation title if this is the first user message
      if (messagesRef.current.length === 1 && conversationTitle === 'New Conversation') {
        const shortTitle = content.length > 30
          ? content.substring(0, 30) + '...'
          : content;
        setConversationTitle(shortTitle);
      }

      // Format messages for API (excluding the empty assistant message)
      const currentMessages = messagesRef.current.filter(msg => msg.id !== assistantId);
      
      const apiMessages: ApiChatMessage[] = currentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Adding the new user message for the API
      apiMessages.push({
        role: 'user',
        content
      });

      let fullResponse = '';

      // Stream the response
      await getChatCompletion(
        apiMessages,
        (chunk) => {
          fullResponse += chunk;
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: fullResponse }
                : msg
            )
          );
        }
      );

    } catch (error) {
      console.error('Error sending message:', error);
      addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [addMessage, conversationTitle]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationTitle('New Conversation');
    
    // We'll add the welcome message through the initial useEffect rather than here
    // to avoid duplicate messages
  }, []);

  const saveCurrentConversation = useCallback((): string | null => {
    if (messages.length > 0) {
      const id = Date.now().toString();
      const newSavedConversation = {
        id,
        title: conversationTitle,
        date: new Date()
      };

      // Save to localStorage for persistence
      const currentConversations = JSON.parse(localStorage.getItem('savedConversations') || '[]');
      const updatedConversations = [...currentConversations, {
        id,
        title: conversationTitle,
        date: new Date().toISOString(),
        messages: messages
      }];
      localStorage.setItem('savedConversations', JSON.stringify(updatedConversations));

      // Update state
      setSavedConversations(prev => [...prev, newSavedConversation]);

      return id;
    }
    return null;
  }, [conversationTitle, messages]);

  // Load saved conversations from localStorage on initial mount
  useEffect(() => {
    try {
      interface SavedConversation {
        id: string;
        title: string;
        date: string;
      }
      const savedConvs = JSON.parse(localStorage.getItem('savedConversations') || '[]');
      setSavedConversations(savedConvs.map((conv: SavedConversation) => ({
        id: conv.id,
        title: conv.title,
        date: new Date(conv.date)
      })));
    } catch (e) {
      console.error('Error loading saved conversations:', e);
    }
  }, []);

  const contextValue = useMemo(() => ({
    messages,
    isLoading,
    addMessage,
    sendMessage,
    clearMessages,
    updateMessage,
    conversationTitle,
    setConversationTitle,
    savedConversations,
    saveCurrentConversation
  }), [messages, isLoading, addMessage, sendMessage, clearMessages, updateMessage, conversationTitle, setConversationTitle, savedConversations, saveCurrentConversation]);

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};

// Custom hook for theme management with localStorage persistence
type Theme = 'light' | 'dark';

function useThemeMode(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) return savedTheme;

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  return [theme, setTheme];
}

// Message component with markdown support
interface MessageBubbleProps {
  message: Message;
  theme: Theme;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onSave: (id: string) => void;
  onCopy: (text: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  theme,
  onLike,
  onDislike,
  onSave,
  onCopy
}) => {
  const isUser = message.role === 'user';

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className={`h-10 w-10 rounded-full mr-3 flex-shrink-0 ${theme === 'dark' ? 'bg-indigo-700' : 'bg-indigo-500'} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
          AI
        </div>
      )}

      <div className="max-w-[85%]">
        <div className={`p-4 rounded-2xl shadow-sm ${
          isUser
            ? `${theme === 'dark' ? 'bg-indigo-800' : 'bg-indigo-600'} text-white rounded-br-none`
            : `${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'} rounded-bl-none`
        }`}>
          {isUser ? (
            <div>{message.content}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={theme === 'dark' ? atomDark : github}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {message.content || ' '}
              </ReactMarkdown>
            </div>
          )}
        </div>

        <div className={`mt-1 flex ${isUser ? 'justify-end' : 'justify-start'} opacity-0 group-hover:opacity-100 transition-opacity`}>
          <div className={`flex space-x-2 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            <span>
              {new Intl.DateTimeFormat('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              }).format(message.timestamp)}
            </span>

            {!isUser && (
              <>
                <button
                  onClick={() => onCopy(message.content)}
                  className={`p-1 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}
                  title="Copy to clipboard"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => onLike(message.id)}
                  className={`p-1 rounded ${message.liked ? (theme === 'dark' ? 'text-green-400 bg-gray-700' : 'text-green-600 bg-gray-200') : `hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}`}
                  title="Like"
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  onClick={() => onDislike(message.id)}
                  className={`p-1 rounded ${message.disliked ? (theme === 'dark' ? 'text-red-400 bg-gray-700' : 'text-red-600 bg-gray-200') : `hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}`}
                  title="Dislike"
                >
                  <ThumbsDown size={14} />
                </button>
                <button
                  onClick={() => onSave(message.id)}
                  className={`p-1 rounded ${message.saved ? (theme === 'dark' ? 'text-yellow-400 bg-gray-700' : 'text-yellow-600 bg-gray-200') : `hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}`}
                  title="Save response"
                >
                  <Bookmark size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {isUser && (
        <div className={`h-10 w-10 rounded-full ml-3 flex-shrink-0 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center ${theme === 'dark' ? 'text-white' : 'text-gray-700'} text-sm font-bold shadow-sm`}>
          YOU
        </div>
      )}
    </div>
  );
};

function ChatInterface() {
  const [theme, setTheme] = useThemeMode();

  // Wrap the component with the provider
  return (
    <ChatProvider>
      <ChatInterfaceContent
        theme={theme}
        setTheme={setTheme}
      />
    </ChatProvider>
  );
}

interface ChatInterfaceContentProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function ChatInterfaceContent({
  theme,
  setTheme
}: ChatInterfaceContentProps) {
  const {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    updateMessage,
    conversationTitle,
    setConversationTitle,
    savedConversations,
    saveCurrentConversation
  } = useChatContext();

  const navigate = useNavigate();
  const { signOut, user } = useAuthStore();

  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(conversationTitle);
  const [savedNotification, setSavedNotification] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Update titleInput when conversationTitle changes
  useEffect(() => {
    setTitleInput(conversationTitle);
  }, [conversationTitle]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      const container = chatContainerRef.current;
      if (container) {
        const shouldScroll =
          container.scrollHeight - container.scrollTop - container.clientHeight < 300 ||
          isLoading; // Always scroll while loading

        if (shouldScroll) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior
          });
        }
      }
    }
  }, [isLoading]);

  // Message feedback handlers
  const handleLikeMessage = useCallback((id: string) => {
    updateMessage(id, { liked: true, disliked: false });
  }, [updateMessage]);

  const handleDislikeMessage = useCallback((id: string) => {
    updateMessage(id, { disliked: true, liked: false });
  }, [updateMessage]);

  const handleSaveMessage = useCallback((id: string) => {
    const message = messages.find(m => m.id === id);
    if (message) {
      updateMessage(id, { saved: !message.saved });

      // Store saved messages in localStorage
      try {
        const savedResponses = JSON.parse(localStorage.getItem('savedResponses') || '[]');
        const isAlreadySaved = savedResponses.some((r: { id: string }) => r.id === id);

        if (!isAlreadySaved && !message.saved) {
          savedResponses.push({
            id,
            content: message.content,
            timestamp: message.timestamp,
            conversationTitle
          });
          localStorage.setItem('savedResponses', JSON.stringify(savedResponses));
        } else if (isAlreadySaved && message.saved) {
          const updatedResponses = savedResponses.filter((r: { id: string }) => r.id !== id);
          localStorage.setItem('savedResponses', JSON.stringify(updatedResponses));
        }
      } catch (e) {
        console.error('Error managing saved responses:', e);
      }
    }
  }, [conversationTitle, messages, updateMessage]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Show a brief notification
        const notification = document.createElement('div');
        notification.textContent = 'Copied to clipboard';
        notification.className = `fixed top-4 right-4 px-4 py-2 rounded-lg 
          ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'} 
          shadow-lg z-50 animate-fade-in-out`;
        document.body.appendChild(notification);

        setTimeout(() => {
          notification.remove();
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  }, [theme]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    let typingInterval: number | undefined;
    let scrollInterval: number | undefined;
    
    if (isLoading) {
      scrollInterval = window.setInterval(scrollToBottom, 100);

      // Typing indicator
      typingInterval = window.setInterval(() => {
        setTyping(prev => !prev);
      }, 500);
    }

    return () => {
      if (scrollInterval) clearInterval(scrollInterval);
      if (typingInterval) clearInterval(typingInterval);
    };
  }, [isLoading, scrollToBottom]);

  // Set document title based on conversation
  useEffect(() => {
    document.title = conversationTitle || 'AI Study Buddy';
  }, [conversationTitle]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    
    if (!trimmedInput || isLoading) return;
    
    // Clear input BEFORE sending message to avoid state conflicts
    setInput('');
    setTyping(false);
    
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
    }
    
    // Now send the message
    await sendMessage(trimmedInput);
    
    // Focus the input field after sending
    inputRef.current?.focus();
  }, [input, isLoading, sendMessage, showEmojiPicker]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [setTheme, theme]);

  const handleTitleUpdate = useCallback(() => {
    try {
      if (titleInput.trim()) {
        setConversationTitle(titleInput.trim());
      } else {
        setTitleInput(conversationTitle); // Reset to current if empty
      }
    } catch (error) {
      console.error('Error updating title:', error);
      setTitleInput(conversationTitle); // Reset to current title on error
    } finally {
      setEditingTitle(false);
    }
  }, [conversationTitle, titleInput, setConversationTitle]);

  const handleSaveConversation = useCallback(() => {
    const id = saveCurrentConversation();
    if (id) {
      // Show success notification
      setSavedNotification(true);
      setTimeout(() => setSavedNotification(false), 3000);
    }
    setShowSettings(false);
  }, [saveCurrentConversation]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
    setShowSettings(false);
  }, [navigate, signOut]);

  const emojis = useMemo(() => ['😊', '🤔', '👍', '👋', '🎓', '📚', '💡', '⭐', '🧠', '🔍', '🌟', '👏'], []);

  const insertEmoji = useCallback((emoji: string) => {
    setInput(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key to close modals
      if (e.key === 'Escape') {
        if (showEmojiPicker) setShowEmojiPicker(false);
        if (showSettings) setShowSettings(false);
        if (showHistory) setShowHistory(false);
        if (showProfile) setShowProfile(false);
        if (editingTitle) setEditingTitle(false);
      }

      // Ctrl+Enter to submit
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isLoading && input.trim()) {
        handleSubmit(e as unknown as React.FormEvent);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [input, isLoading, showEmojiPicker, showSettings, showHistory, showProfile, editingTitle, handleSubmit]);

  const sampleQuestions = useMemo(() => (
    <div className="mt-6 space-y-2">
      {["Explain the concept of machine learning in simple terms.",
        "What are the key events that led to World War II?",
        "Help me understand calculus derivatives"
      ].map((question) => (
        <button
          key={question}
          onClick={() => setInput(question)}
          className={`w-full px-4 py-2 rounded-lg ${
            theme === 'dark'
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-200'
              : 'bg-white hover:bg-gray-100 text-gray-700'
          } shadow-sm border ${
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          "{question}"
        </button>
      ))}
    </div>
  ), [theme]);

  const emptyState = useMemo(() => (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className={`p-4 rounded-full ${theme === 'dark' ? 'bg-gray-800' : 'bg-indigo-100'} mb-4`}>
        <MessageSquare className={`h-8 w-8 ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`} />
      </div>
      <p className={`text-lg font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
        Start a conversation with your AI Study Buddy!
      </p>
      <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
        Ask questions, discuss topics, or get study recommendations
      </p>
      {sampleQuestions}
    </div>
  ), [sampleQuestions, theme]);

  return (
    <div className={`h-full flex flex-col rounded-xl shadow-xl overflow-hidden transition-all duration-300 ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-800'}`}>
      {/* Header */}
      <div className="relative">
        <div className={`px-6 py-4 ${theme === 'dark'
          ? 'bg-gradient-to-r from-blue-900 to-purple-900'
          : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white bg-opacity-20">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>

              <div>
                {editingTitle ? (
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      className={`text-lg font-bold bg-white bg-opacity-10 text-white rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50`}
                      onBlur={handleTitleUpdate}
                      onKeyDown={(e) => e.key === 'Enter' && handleTitleUpdate()}
                      autoFocus
                    />
                    <button
                      onClick={handleTitleUpdate}
                      className="ml-2 p-1 rounded-full hover:bg-white hover:bg-opacity-10"
                    >
                      <Send size={14} className="text-white" />
                    </button>
                  </div>
                ) : (
                  <h2
                    className="text-xl font-bold text-white cursor-pointer hover:underline"
                    onClick={() => setEditingTitle(true)}
                    title="Edit conversation title"
                  >
                    {conversationTitle}
                    <span className="ml-2 opacity-50 text-xs">✏️</span>
                  </h2>
                )}
                <div className="flex items-center">
                  <span className={`h-2 w-2 rounded-full ${isLoading ? 'bg-green-400 animate-pulse' : 'bg-green-400'} mr-2`}></span>
                  <span className="text-xs text-white text-opacity-80">{isLoading ? 'Thinking...' : 'Online'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-white hover:bg-opacity-10 transition-all"
                title={theme === 'light' ? 'Dark mode' : 'Light mode'}
              >
                {theme === 'light' ? <Moon className="h-5 w-5 text-white" /> : <Sun className="h-5 w-5 text-white" />}
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-full hover:bg-white hover:bg-opacity-10 transition-all"
                title="Settings"
              >
                <Settings className="h-5 w-5 text-white" />
              </button>
              <button
                onClick={clearMessages}
                className="p-2 rounded-full hover:bg-white hover:bg-opacity-10 transition-all"
                title="Clear chat"
                disabled={isLoading}
              >
                <Trash2 className={`h-5 w-5 text-white ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </button>
            </div>
          </div>

          {/* Settings dropdown */}
          {showSettings && (
            <div className={`absolute right-4 mt-2 w-52 rounded-lg shadow-lg z-10 overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} ring-1 ring-black ring-opacity-5 divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
              <div className="py-1">
                <button
                  onClick={() => { setShowProfile(true); setShowSettings(false); }}
                  className={`flex items-center w-full px-4 py-2 text-sm ${theme === 'dark' ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <User className="mr-3 h-4 w-4" />
                  View Profile
                </button>
                <button
                  onClick={() => { setShowHistory(true); setShowSettings(false); }}
                  className={`flex items-center w-full px-4 py-2 text-sm ${theme === 'dark' ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <History className="mr-3 h-4 w-4" />
                  Chat History
                </button><button
                  onClick={handleSaveConversation}
                  className={`flex items-center w-full px-4 py-2 text-sm ${theme === 'dark' ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <Save className="mr-3 h-4 w-4" />
                  Save Conversation
                </button>
              </div>
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className={`flex items-center w-full px-4 py-2 text-sm ${theme === 'dark' ? 'text-red-400 hover:bg-gray-700' : 'text-red-500 hover:bg-gray-100'}`}
                >
                  <LogOut className="mr-3 h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profile modal */}
      {showProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className={`relative rounded-xl shadow-2xl max-w-md w-full p-6 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
            <button
              onClick={() => setShowProfile(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-opacity-10 hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center">
              <div className={`h-20 w-20 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center text-2xl font-bold mb-4`}>
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <h3 className="text-xl font-bold mb-1">{user?.displayName || 'User'}</h3>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-4`}>{user?.email}</p>
              <div className={`w-full p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} mb-4`}>
                <h4 className="font-medium mb-2">Account Information</h4>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                  Member since: {user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Unknown'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className={`w-full py-2 px-4 rounded-lg ${theme === 'dark' ? 'bg-red-900 hover:bg-red-800' : 'bg-red-500 hover:bg-red-600'} text-white font-medium transition-colors`}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className={`relative rounded-xl shadow-2xl max-w-md w-full p-6 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
            <button
              onClick={() => setShowHistory(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-opacity-10 hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-xl font-bold mb-4">Conversation History</h3>
            {savedConversations.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                {savedConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`p-3 rounded-lg mb-2 cursor-pointer ${theme === 'dark' ? 'hover:bg-gray-700 bg-gray-750' : 'hover:bg-gray-100 bg-gray-50'}`}
                    onClick={() => {
                      // Logic to load conversation would go here
                      setShowHistory(false);
                    }}
                  >
                    <h4 className="font-medium">{conv.title}</h4>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {new Date(conv.date).toLocaleDateString()} at {new Date(conv.date).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No saved conversations yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length <= 1 ? (
          // Show empty state when no user messages yet
          emptyState
        ) : (
          // Show message bubbles
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              theme={theme}
              onLike={handleLikeMessage}
              onDislike={handleDislikeMessage}
              onSave={handleSaveMessage}
              onCopy={copyToClipboard}
            />
          ))
        )}
        <div ref={messagesEndRef} /> {/* Empty div for scrolling to bottom */}
      </div>

      {/* Input area */}
      <div className={`px-4 pt-2 pb-4 border-t ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            className={`w-full p-4 pr-20 rounded-xl resize-none ${
              theme === 'dark'
                ? 'bg-gray-800 text-white placeholder-gray-500 focus:ring-indigo-500'
                : 'bg-white text-gray-900 placeholder-gray-400 focus:ring-indigo-500'
            } border ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
            } shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-opacity-50`}
            rows={2}
            disabled={isLoading}
          />
          
          {/* Emoji picker button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowEmojiPicker(!showEmojiPicker);
            }}
            className={`absolute right-16 bottom-4 p-2 rounded-full ${
              theme === 'dark'
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
            } transition-colors`}
            disabled={isLoading}
          >
            😊
          </button>
          
          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 bottom-2 p-2 rounded-full ${
              input.trim() && !isLoading
                ? theme === 'dark'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                : theme === 'dark'
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            } transition-colors`}
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Send className="h-6 w-6" />
            )}
          </button>
          
          {/* Emoji picker dropdown */}
          {showEmojiPicker && (
            <div className={`absolute bottom-full right-0 mb-1 p-2 rounded-lg grid grid-cols-6 gap-1 ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            } shadow-lg z-10`}>
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className={`text-xl p-2 rounded hover:${
                    theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                  } transition-colors`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </form>
        
        <div className="mt-2 text-xs text-center">
          <span className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}>
            Press Ctrl+Enter to send message
          </span>
        </div>
      </div>

      {/* Saved notification */}
      {savedNotification && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg ${
          theme === 'dark' ? 'bg-gray-800 text-green-400' : 'bg-white text-green-600'
        } flex items-center space-x-2 animate-fade-in-out z-50`}>
          <Bookmark className="h-4 w-4" />
          <span>Conversation saved successfully!</span>
        </div>
      )}
    </div>
  );
}

export { ChatProvider, useChatContext, ChatInterface };