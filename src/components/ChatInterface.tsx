import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Send, 
  Trash2, 
  Loader2, 
  Moon, 
  Sun, 
  MessageSquare, 
  LogOut, 
  X, 
  ThumbsUp, 
  ThumbsDown, 
  Copy, 
  Check, 
  Plus, 
  Menu, 
  Edit3,
  Mic,
  MicOff,
  BookOpen,
  HelpCircle,
  Activity,
  Paperclip,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { ChatMessage } from '../types/chat';
import { DeepgramVoiceAgent } from '../lib/deepgramAgent';
import ReactMarkdown from 'react-markdown';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark as atomDark, github } from 'react-syntax-highlighter/dist/esm/styles/hljs';

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
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  return [theme, setTheme];
}

// ----------------------------------------------------
// Interactive Quiz Component
// ----------------------------------------------------
interface QuizItem {
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
}

const InteractiveQuiz: React.FC<{ quizData: string; theme: Theme; isGenerating?: boolean }> = ({ quizData, theme, isGenerating = false }) => {
  const questions: QuizItem[] = useMemo(() => {
    try {
      let jsonStr = quizData.trim();
      const startIdx = jsonStr.indexOf('[');
      const endIdx = jsonStr.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
      }
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse quiz JSON:", e, quizData);
      return [];
    }
  }, [quizData]);

  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (questions.length === 0) {
    if (isGenerating) {
      return (
        <div className={`p-5 rounded-2xl border shadow-md my-3 w-full max-w-xl overflow-hidden transition-all animate-pulse ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h4 className="text-base font-bold mb-4 flex items-center gap-2 text-indigo-500">
            <Loader2 className="animate-spin h-4 w-4" />
            <span>Generating Interactive Quiz...</span>
          </h4>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"></div>
            <div className="space-y-2">
              <div className="h-9 bg-gray-100 dark:bg-gray-700 rounded-xl w-full"></div>
              <div className="h-9 bg-gray-100 dark:bg-gray-700 rounded-xl w-full"></div>
              <div className="h-9 bg-gray-100 dark:bg-gray-700 rounded-xl w-full"></div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">
        Failed to render Quiz. Raw output:
        <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap">{quizData}</pre>
      </div>
    );
  }

  const handleSelect = (qIdx: number, option: string) => {
    if (submitted) return;
    setSelectedAnswers(prev => ({ ...prev, [qIdx]: option }));
  };

  const isAllAnswered = Object.keys(selectedAnswers).length === questions.length;

  return (
    <div className={`p-5 rounded-2xl border shadow-md my-3 w-full max-w-xl overflow-hidden transition-all ${
      theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-850'
    }`}>
      <h4 className="text-base font-bold mb-4 flex items-center gap-2 text-indigo-500">
        🎓 Interactive Knowledge Check
      </h4>
      <div className="space-y-6">
        {questions.map((q, qIdx) => {
          const selected = selectedAnswers[qIdx];
          const isCorrect = selected === q.answer;

          return (
            <div key={qIdx} className="space-y-3">
              <p className="font-semibold text-sm leading-relaxed">{qIdx + 1}. {q.question}</p>
              <div className="grid grid-cols-1 gap-2">
                {q.options.map((opt) => {
                  const isOptSelected = selected === opt;
                  let btnStyle = theme === 'dark' 
                    ? 'bg-gray-700/50 hover:bg-gray-705 border-gray-600' 
                    : 'bg-gray-50 hover:bg-gray-100 border-gray-200';

                  if (submitted) {
                    if (opt === q.answer) {
                      btnStyle = 'bg-green-500/20 border-green-500 text-green-500 font-semibold';
                    } else if (isOptSelected && !isCorrect) {
                      btnStyle = 'bg-red-500/20 border-red-500 text-red-500';
                    } else {
                      btnStyle = 'opacity-60 border-transparent bg-transparent cursor-default';
                    }
                  } else if (isOptSelected) {
                    btnStyle = 'bg-indigo-600/10 border-indigo-500 text-indigo-500 font-semibold';
                  }

                  return (
                    <button
                      key={opt}
                      onClick={() => handleSelect(qIdx, opt)}
                      disabled={submitted}
                      className={`text-left px-4 py-2.5 rounded-xl border text-sm font-sans normal-case transition-all focus:outline-none w-full whitespace-normal break-words ${btnStyle}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <div className={`mt-2 p-3 rounded-lg text-xs leading-relaxed ${
                  isCorrect 
                    ? theme === 'dark' ? 'bg-green-950/20 text-green-400 border border-green-900/30' : 'bg-green-50 text-green-700 border border-green-100'
                    : theme === 'dark' ? 'bg-gray-750 text-gray-300 border border-gray-700' : 'bg-gray-50 text-gray-600 border border-gray-150'
                }`}>
                  <span className="font-bold">{isCorrect ? '✓ Correct! ' : '✗ Incorrect. '}</span>
                  {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!submitted && (
        <button
          onClick={() => setSubmitted(true)}
          disabled={!isAllAnswered}
          className={`mt-5 w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            isAllAnswered 
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow active:scale-98' 
              : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          Submit Quiz
        </button>
      )}
    </div>
  );
};

// ----------------------------------------------------
// Interactive Flashcard Component
// ----------------------------------------------------
interface FlashcardItem {
  front: string;
  back: string;
}

const FlashcardDeck: React.FC<{ cardData: string; theme: Theme; isGenerating?: boolean }> = ({ cardData, theme, isGenerating = false }) => {
  const cards: FlashcardItem[] = useMemo(() => {
    try {
      let jsonStr = cardData.trim();
      const startIdx = jsonStr.indexOf('[');
      const endIdx = jsonStr.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
      }
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse flashcards JSON:", e, cardData);
      return [];
    }
  }, [cardData]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length === 0) {
    if (isGenerating) {
      return (
        <div className="my-3 max-w-sm w-full mx-auto flex flex-col items-center animate-pulse">
          <div className={`w-full h-52 rounded-2xl border p-6 flex flex-col justify-between shadow-md transition-all ${
            theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
              <Loader2 className="animate-spin h-3.5 w-3.5" />
              <span>Generating Flashcards...</span>
            </span>
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
            </div>
            <span className="text-[10px] self-end opacity-60">Preparing Deck...</span>
          </div>
        </div>
      );
    }
    return (
      <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">
        Failed to render Flashcards. Raw output:
        <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap">{cardData}</pre>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  const handleNext = () => {
    setFlipped(false);
    setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % cards.length);
    }, 150);
  };

  const handlePrev = () => {
    setFlipped(false);
    setTimeout(() => {
      setCurrentIndex(prev => (prev - 1 + cards.length) % cards.length);
    }, 150);
  };

  return (
    <div className="my-3 max-w-sm w-full mx-auto flex flex-col items-center">
      {/* 3D Card Container */}
      <div 
        onClick={() => setFlipped(prev => !prev)}
        className="w-full h-52 cursor-pointer [perspective:1000px] mb-4 group"
      >
        <div className={`relative w-full h-full duration-500 [transform-style:preserve-3d] ${
          flipped ? '[transform:rotateY(180deg)]' : ''
        }`}>
          {/* Card Front */}
          <div className={`absolute inset-0 w-full h-full rounded-2xl border p-6 flex flex-col justify-between [backface-visibility:hidden] shadow-md transition-all ${
            theme === 'dark' 
              ? 'bg-gray-800 border-gray-700 text-white' 
              : 'bg-white border-gray-200 text-gray-800'
          }`}>
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Question / Term</span>
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="font-semibold text-sm leading-snug">{currentCard.front}</p>
            </div>
            <span className="text-[10px] self-end opacity-60">Click to Flip 🔄</span>
          </div>

          {/* Card Back */}
          <div className={`absolute inset-0 w-full h-full rounded-2xl border p-6 flex flex-col justify-between [backface-visibility:hidden] [transform:rotateY(180deg)] shadow-md transition-all ${
            theme === 'dark' 
              ? 'bg-indigo-950/80 border-indigo-900 text-indigo-200' 
              : 'bg-indigo-50 border-indigo-100 text-indigo-900'
          }`}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Answer / Definition</span>
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="font-semibold text-sm leading-snug">{currentCard.back}</p>
            </div>
            <span className="text-[10px] self-end opacity-60">Click to Flip 🔄</span>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-4">
        <button
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
            theme === 'dark' ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-250 bg-white text-gray-700'
          }`}
        >
          Previous
        </button>
        <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          {currentIndex + 1} of {cards.length}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
            theme === 'dark' ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-250 bg-white text-gray-700'
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// Message Bubble (with parsed Quiz and Flashcards)
// ----------------------------------------------------
interface MessageBubbleProps {
  message: ChatMessage;
  theme: Theme;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onCopy: (text: string) => void;
  copiedId: string | null;
  isGenerating?: boolean;
  onVoiceDiscuss?: (message: ChatMessage) => void;
  activeDiscussingId?: string | null;
  isAgentActive?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  theme,
  onLike,
  onDislike,
  onCopy,
  copiedId,
  isGenerating = false,
  onVoiceDiscuss,
  activeDiscussingId,
  isAgentActive = false
}) => {
  const isUser = message.role === 'user';

  // Auto-close code blocks if streaming
  let displayContent = message.content || '';
  if (isGenerating && displayContent) {
    const fenceCount = (displayContent.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      displayContent += '\n```';
    }
  }

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
        {/* Avatar */}
        <div className={`h-9 w-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold shadow-sm ${
          isUser 
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' 
            : theme === 'dark' ? 'bg-gray-850 text-indigo-400 border border-gray-700' : 'bg-white text-indigo-600 border border-gray-200'
        }`}>
          {isUser ? 'U' : 'AI'}
        </div>

        {/* Bubble */}
        <div className="flex flex-col">
          <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed ${
            isUser
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-none'
              : theme === 'dark' 
                ? 'bg-gray-800 text-gray-150 border border-gray-700/60 rounded-tl-none' 
                : 'bg-white text-gray-800 border border-gray-150 rounded-tl-none'
          }`}>
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    pre({ children }) {
                      return <>{children}</>;
                    },
                    code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeContent = String(children).replace(/\n$/, '');

                      if (!inline && match) {
                        if (match[1] === 'quiz') {
                          return <InteractiveQuiz quizData={codeContent} theme={theme} isGenerating={isGenerating} />;
                        }
                        if (match[1] === 'flashcards') {
                          return <FlashcardDeck cardData={codeContent} theme={theme} isGenerating={isGenerating} />;
                        }

                        return (
                          <div className="my-2 rounded-lg overflow-hidden border border-gray-700">
                            <SyntaxHighlighter
                              style={theme === 'dark' ? atomDark : github}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{ margin: 0, padding: '12px' }}
                              {...props}
                            >
                              {codeContent}
                            </SyntaxHighlighter>
                          </div>
                        );
                      }
                      
                      return (
                        <code className={`px-1.5 py-0.5 rounded ${theme === 'dark' ? 'bg-gray-700 text-gray-250' : 'bg-gray-100 text-gray-800'} text-xs font-semibold`} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {displayContent || ' '}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Timestamp & Actions */}
          <div className={`mt-1.5 flex items-center gap-3 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} ${isUser ? 'justify-end' : 'justify-start'}`}>
            <span>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            
            {!isUser && message.content && (
              <div className="flex items-center gap-1.5 ml-2 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity">
                <button
                  onClick={() => onCopy(message.content)}
                  className={`p-1 rounded hover:${theme === 'dark' ? 'bg-gray-700 text-gray-250' : 'bg-gray-100 text-gray-700'} transition-colors`}
                  title="Copy reply"
                >
                  {copiedId === message.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                </button>
                <button
                  onClick={() => onLike(message.id)}
                  className={`p-1 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-105'} transition-colors ${message.liked ? 'text-green-500' : ''}`}
                  title="Like"
                >
                  <ThumbsUp size={13} />
                </button>
                <button
                  onClick={() => onDislike(message.id)}
                  className={`p-1 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-105'} transition-colors ${message.disliked ? 'text-red-500' : ''}`}
                  title="Dislike"
                >
                  <ThumbsDown size={13} />
                </button>
                <button
                  onClick={() => onVoiceDiscuss?.(message)}
                  className={`p-1 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-105'} transition-colors ${
                    activeDiscussingId === message.id && isAgentActive
                      ? 'text-indigo-500 bg-indigo-500/10'
                      : ''
                  }`}
                  title={activeDiscussingId === message.id && isAgentActive ? 'Stop TeachTalk Discussion' : 'Discuss this with TeachTalk voice agent'}
                >
                  <Mic size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// Main ChatInterface Dashboard
// ----------------------------------------------------
export function ChatInterface() {
  const navigate = useNavigate();
  const [theme, setTheme] = useThemeMode();
  
  // Auth state
  const { user, signOut } = useAuthStore();
  
  // Chat state
  const {
    conversations,
    messages,
    activeConversationId,
    isLoading,
    fetchConversations,
    selectConversation,
    createConversation,
    deleteConversation,
    updateConversationTitle,
    sendMessage,
    toggleMessageFeedback,
    clearActiveChat,
    addCompletedTurn,
    documentChunks,
    uploadedFiles,
    addDocument,
    clearDocuments
  } = useChatStore();

  // Local component states
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // TeachTalk Streaming Voice Agent State
  const [agentState, setAgentState] = useState<'idle' | 'connecting' | 'listening' | 'speaking' | 'disconnected'>('idle');
  const [activeDiscussingId, setActiveDiscussingId] = useState<string | null>(null);
  const [voiceUserTranscript, setVoiceUserTranscript] = useState('');
  const [voiceAgentTranscript, setVoiceAgentTranscript] = useState('');
  const agentRef = useRef<DeepgramVoiceAgent | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // System Prompt for Voice Agent (Socratic tutor tailored for speech connection)
  const systemPrompt = `You are a helpful, encouraging Socratic tutor. Keep your answers brief and conversational, suitable for voice interaction. Avoid markdown, lists, or headers since your output will be read aloud.`;

  const getDynamicVoicePrompt = useCallback(() => {
    if (documentChunks.length > 0) {
      // Append the full text chunks as context
      const fullContext = documentChunks.map(c => `From "${c.fileName}":\n${c.text}`).join('\n\n');
      return `${systemPrompt}\n\nHere is some study context from files uploaded by the user:\n"""\n${fullContext}\n"""\nUse this context to answer the user's questions where relevant. Keep your responses short and conversational.`;
    }
    return systemPrompt;
  }, [documentChunks, systemPrompt]);

  // Initialize and load conversations
  useEffect(() => {
    fetchConversations().then(() => {
      const convs = useChatStore.getState().conversations;
      if (convs.length > 0 && !useChatStore.getState().activeConversationId) {
        selectConversation(convs[0].id);
      }
    });
  }, [fetchConversations, selectConversation]);

  // Sync title input
  const activeConversation = useMemo(() => {
    return conversations.find(c => c.id === activeConversationId);
  }, [conversations, activeConversationId]);

  useEffect(() => {
    if (activeConversation) {
      setTitleInput(activeConversation.title);
    } else {
      setTitleInput('');
    }
  }, [activeConversation]);

  // Scroll to bottom on new message
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, voiceUserTranscript, voiceAgentTranscript, scrollToBottom]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup Voice Agent on unmount
  useEffect(() => {
    return () => {
      if (agentRef.current) {
        agentRef.current.stop();
      }
    };
  }, []);

  // Handle Logout
  const handleLogout = async () => {
    try {
      if (agentRef.current) {
        agentRef.current.stop();
        setAgentState('idle');
      }
      await signOut();
      clearActiveChat();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Submit chat message
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    await sendMessage(trimmed);
    inputRef.current?.focus();
  };

  // Helper to load PDF.js from CDN dynamically
  const loadPdfJs = () => {
    return new Promise<void>((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load PDF.js parser script from CDN.'));
      document.head.appendChild(script);
    });
  };

  // Helper to extract text from PDF pages
  const readPdfText = async (file: File): Promise<string> => {
    await loadPdfJs();
    const pdfjsLib = (window as any).pdfjsLib;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  };

  // Handle RAG study notes upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log('handleFileUpload: Starting upload of file:', file.name, 'Size:', file.size, 'Type:', file.type);
      try {
        if (file.name.toLowerCase().endsWith('.pdf')) {
          const text = await readPdfText(file);
          console.log('handleFileUpload: PDF parsed successfully. Text length:', text.length);
          if (text.trim()) {
            addDocument(file.name, text);
          } else {
            alert(`Could not extract readable text from PDF: ${file.name}`);
          }
        } else {
          // Process text/markdown files
          const reader = new FileReader();
          reader.onload = (event) => {
            const text = event.target?.result as string;
            console.log('handleFileUpload: Text/Markdown file parsed. Text length:', text?.length);
            if (text) {
              addDocument(file.name, text);
            }
          };
          reader.readAsText(file);
        }
      } catch (err: any) {
        console.error('Failed to parse file:', file.name, err);
        alert(`Failed to load file ${file.name}: ${err.message || err}`);
      }
    }
    e.target.value = '';
  };

  // TeachTalk Agent Toggle Function (Microphone button click)
  const handleTeachTalkToggle = async () => {
    if (agentState !== 'idle') {
      // Disconnect active Voice Agent
      if (agentRef.current) {
        agentRef.current.stop();
      }
      setAgentState('idle');
      setActiveDiscussingId(null);
      setVoiceUserTranscript('');
      setVoiceAgentTranscript('');
      return;
    }

    try {
      const agent = new DeepgramVoiceAgent(
        getDynamicVoicePrompt(),
        messages,
        {
          onStateChange: (state, err) => {
            if (state === 'error') {
              setAgentState('idle');
              setActiveDiscussingId(null);
              alert(err || 'Failed to connect');
            } else if (state === 'disconnected') {
              setAgentState('idle');
              setActiveDiscussingId(null);
            } else {
              setAgentState(state as any);
            }
          },
          onUserTranscript: (text) => {
            setVoiceUserTranscript(text);
          },
          onAgentTranscript: (text) => {
            setVoiceAgentTranscript(text);
          },
          onTurnComplete: (userText, agentText) => {
            console.log('Voice turn completed (TeachTalk):', { userText, agentText });
            // Commit user speech transcript & agent reply directly to database and chat list logs
            addCompletedTurn(userText, agentText);
            // Reset local live audio transcript indicators
            setVoiceUserTranscript('');
            setVoiceAgentTranscript('');
          }
        }
      );

      agentRef.current = agent;
      await agent.start();
    } catch (e: any) {
      console.error('Failed to start TeachTalk Voice Agent:', e);
      setAgentState('idle');
    }
  };

  // Specific message voice discuss handler
  const handleVoiceDiscuss = async (message: ChatMessage) => {
    // If agent is active and we click the same message, turn it off
    if (agentState !== 'idle' && activeDiscussingId === message.id) {
      if (agentRef.current) {
        agentRef.current.stop();
      }
      setAgentState('idle');
      setActiveDiscussingId(null);
      setVoiceUserTranscript('');
      setVoiceAgentTranscript('');
      return;
    }

    // Stop active agent if running
    if (agentRef.current) {
      agentRef.current.stop();
    }

    setAgentState('connecting');
    setActiveDiscussingId(message.id);
    setVoiceUserTranscript('');
    setVoiceAgentTranscript('');

    // Slice history messages up to (and including) this specific message
    const msgIndex = messages.findIndex(m => m.id === message.id);
    const historySlice = msgIndex !== -1 ? messages.slice(0, msgIndex + 1) : [message];

    try {
      const discussPrompt = `${getDynamicVoicePrompt()}\n\nThe user wants to discuss your specific answer: "${message.content}". Keep your voice responses very brief, and Socrates-style quiz/guide them on this specific topic.`;

      const agent = new DeepgramVoiceAgent(
        discussPrompt,
        historySlice,
        {
          onStateChange: (state, err) => {
            if (state === 'error') {
              setAgentState('idle');
              setActiveDiscussingId(null);
              alert(err || 'Failed to connect');
            } else if (state === 'disconnected') {
              setAgentState('idle');
              setActiveDiscussingId(null);
            } else {
              setAgentState(state as any);
            }
          },
          onUserTranscript: (text) => {
            setVoiceUserTranscript(text);
          },
          onAgentTranscript: (text) => {
            setVoiceAgentTranscript(text);
          },
          onTurnComplete: (userText, agentText) => {
            console.log('Voice turn completed (Discuss):', { userText, agentText });
            addCompletedTurn(userText, agentText);
            setVoiceUserTranscript('');
            setVoiceAgentTranscript('');
          }
        }
      );

      agentRef.current = agent;
      await agent.start();
    } catch (e: any) {
      console.error('Failed to start discussion agent:', e);
      setAgentState('idle');
      setActiveDiscussingId(null);
    }
  };

  // Handle Ctrl+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Copy response content
  const handleCopy = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Handle conversation title update
  const handleTitleSubmit = () => {
    if (activeConversationId && titleInput.trim() && titleInput !== activeConversation?.title) {
      updateConversationTitle(activeConversationId, titleInput.trim());
    }
    setEditingTitle(false);
  };

  // Prompt action quick triggers
  const handleTriggerAction = (promptText: string) => {
    setInput('');
    sendMessage(promptText);
  };

  // Empty state rendering
  const emptyState = (
    <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-fade-in">
      <div className={`p-4 rounded-full ${theme === 'dark' ? 'bg-gray-800 text-indigo-400' : 'bg-indigo-50 text-indigo-600'} mb-4 shadow-sm`}>
        <MessageSquare className="h-9 w-9" />
      </div>
      <h3 className="text-xl font-bold mb-2">Welcome to AI Study Buddy</h3>
      <p className={`text-sm max-w-md ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-6`}>
        Ask me complex questions, let's summarize code, draft outlines, or practice interactive quizzes on any study topic!
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
        {[
          "Explain the concept of quantum computing simply",
          "Give me an active recall quiz about Photosynthesis",
          "Help me debug an asynchronous Javascript fetch loop",
          "Draft a study schedule for computer networks exam"
        ].map((q) => (
          <button
            key={q}
            onClick={() => handleTriggerAction(q)}
            className={`text-left p-3.5 rounded-xl border text-sm transition-all duration-200 ${
              theme === 'dark'
                ? 'bg-gray-800/50 hover:bg-gray-800 border-gray-700 text-gray-250'
                : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700 shadow-sm'
            }`}
          >
            "{q}"
          </button>
        ))}
      </div>
    </div>
  );

  const isAgentActive = agentState !== 'idle';

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
      
      {/* Sidebar Panel */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 transform flex flex-col border-r transition-transform duration-300 md:relative md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-0 -translate-x-72'
      } ${
        theme === 'dark' 
          ? 'bg-gray-950 border-gray-850' 
          : 'bg-white border-gray-200'
      }`}>
        
        {/* Sidebar Header */}
        <div className="p-4 border-b flex items-center justify-between border-inherit">
          <div className="flex items-center gap-2.5">
            <div className="h-8.5 w-8.5 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-base shadow">
              S
            </div>
            <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">
              Study Buddy
            </span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* New Session Button */}
        <div className="p-4">
          <button
            onClick={() => {
              createConversation();
              setSidebarOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 transition-all shadow-md active:scale-98"
          >
            <Plus size={16} />
            New Study Session
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                onClick={() => {
                  selectConversation(conv.id);
                  setSidebarOpen(false);
                }}
                className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                  isActive
                    ? theme === 'dark' ? 'bg-indigo-900/40 text-indigo-400 border border-indigo-800/40' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                    : theme === 'dark' ? 'hover:bg-gray-900/60 text-gray-400 border border-transparent' : 'hover:bg-gray-100/80 text-gray-600 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare size={16} className={isActive ? 'text-indigo-500' : 'text-gray-400'} />
                  <span className="text-sm font-medium truncate pr-1">
                    {conv.title}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 transition-opacity"
                  title="Delete chat session"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className={`p-4 border-t border-inherit text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} text-center`}>
          Built on Groq API & Supabase
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        
        {/* Header */}
        <header className={`h-16 px-6 border-b flex items-center justify-between ${
          theme === 'dark' ? 'bg-gray-900/60 border-gray-800/80' : 'bg-white border-gray-150'
        } backdrop-blur-md z-30`}>
          
          <div className="flex items-center gap-4 min-w-0">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-850 md:hidden"
            >
              <Menu size={20} />
            </button>
            
            {/* Conversation Title */}
            {activeConversationId ? (
              <div className="flex items-center gap-2 min-w-0">
                {editingTitle ? (
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={handleTitleSubmit}
                    onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                    className={`text-base font-bold bg-transparent border-b border-indigo-500 focus:outline-none max-w-[200px] sm:max-w-[320px]`}
                    autoFocus
                  />
                ) : (
                  <>
                    <h2 className="text-base sm:text-lg font-bold truncate">
                      {activeConversation?.title || 'Study Session'}
                    </h2>
                    <button 
                      onClick={() => setEditingTitle(true)}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <Edit3 size={14} />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <h2 className="text-base sm:text-lg font-bold">Study Buddy Workspace</h2>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Live Streaming Voice Indicator */}
            {isAgentActive && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                agentState === 'speaking'
                  ? 'bg-green-500/10 border-green-500 text-green-500'
                  : 'bg-blue-500/10 border-blue-500 text-blue-500 animate-pulse'
              }`}>
                <Activity size={12} className={agentState === 'speaking' ? 'animate-bounce' : ''} />
                <span>TeachTalk: {agentState === 'speaking' ? 'Speaking' : 'Listening'}</span>
              </div>
            )}

            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`p-2.5 rounded-xl border transition-all ${
                theme === 'dark' 
                  ? 'bg-gray-800 border-gray-700 hover:bg-gray-700/80 text-yellow-400' 
                  : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600 shadow-sm'
              }`}
              title={theme === 'light' ? 'Enable Dark Mode' : 'Enable Light Mode'}
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>

            {/* Profile Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className={`flex items-center gap-2 p-1 rounded-full border hover:shadow-sm transition-all focus:outline-none ${
                  theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-250 shadow-sm'
                }`}
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
              </button>

              {profileDropdownOpen && (
                <div className={`absolute right-0 mt-2 w-56 rounded-xl shadow-lg border py-2 animate-fade-in ${
                  theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-800'
                }`}>
                  <div className="px-4 py-2 border-b border-gray-150 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                    <p className="text-sm font-semibold truncate mt-0.5">{user?.email}</p>
                  </div>
                  
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 font-medium transition-colors text-left"
                  >
                    <LogOut size={15} />
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable messages container */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 space-y-4">
          {messages.length === 0 && !voiceUserTranscript && !voiceAgentTranscript ? (
            emptyState
          ) : (
            <div className="max-w-3xl mx-auto w-full">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  theme={theme}
                  onLike={(id) => toggleMessageFeedback(id, 'like')}
                  onDislike={(id) => toggleMessageFeedback(id, 'dislike')}
                  onCopy={(text) => handleCopy(text, message.id)}
                  copiedId={copiedId}
                  isGenerating={isLoading && message.id === messages[messages.length - 1]?.id}
                  onVoiceDiscuss={handleVoiceDiscuss}
                  activeDiscussingId={activeDiscussingId}
                  isAgentActive={agentState !== 'idle'}
                />
              ))}

              {/* Live Streaming User Speech transcript bubble */}
              {voiceUserTranscript && (
                <div key="live-user-bubble" className="flex w-full mb-6 justify-end animate-fade-in">
                  <div className="flex max-w-[80%] flex-row-reverse items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                      U
                    </div>
                    <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm border font-medium italic ${
                      theme === 'dark' ? 'bg-indigo-950/20 border-indigo-900 text-indigo-400' : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                    }`}>
                      {voiceUserTranscript}
                      <span className="ml-1.5 inline-flex gap-0.5 text-xs font-semibold opacity-70">(You: Speaking...)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Streaming Agent response audio transcript bubble */}
              {voiceAgentTranscript && (
                <div key="live-agent-bubble" className="flex w-full mb-6 justify-start animate-fade-in">
                  <div className="flex max-w-[80%] flex-row items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-gray-850 border border-gray-700 text-indigo-400 flex items-center justify-center text-sm font-semibold shadow-sm">
                      AI
                    </div>
                    <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm border font-medium italic ${
                      theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-150 text-gray-600'
                    }`}>
                      {voiceAgentTranscript}
                      <span className="ml-1.5 inline-flex gap-0.5 text-xs font-semibold opacity-70">(Tutor: Speaking...)</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input box */}
        <div className={`p-4 md:p-6 border-t ${
          theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-150'
        }`}>
          <div className="max-w-3xl mx-auto flex flex-col gap-3">
            {/* Quick Action prompts buttons when conversation is active */}
            {messages.length > 0 && !isAgentActive && (
              <div className="flex flex-wrap gap-2 animate-fade-in">
                <button
                  onClick={() => handleTriggerAction("Generate a quiz testing my knowledge on what we just learned.")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold hover:opacity-95 transition-all shadow-sm ${
                    theme === 'dark'
                      ? 'bg-gray-800 border-gray-700 text-indigo-400 hover:bg-gray-750'
                      : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100/50'
                  }`}
                >
                  <HelpCircle size={14} />
                  Test Me (Quiz)
                </button>
                <button
                  onClick={() => handleTriggerAction("Generate a set of flashcards for active recall study on this topic.")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold hover:opacity-95 transition-all shadow-sm ${
                    theme === 'dark'
                      ? 'bg-gray-800 border-gray-700 text-indigo-400 hover:bg-gray-750'
                      : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100/50'
                  }`}
                >
                  <BookOpen size={14} />
                  Create Flashcards
                </button>
              </div>
            )}

            {/* Active uploaded documents badge container */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 max-w-full animate-fade-in">
                {uploadedFiles.map((fileName, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-sm ${
                      theme === 'dark'
                        ? 'bg-indigo-950/30 border-indigo-900/60 text-indigo-400'
                        : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                    }`}
                  >
                    <FileText size={12} />
                    <span className="truncate max-w-[150px]">{fileName}</span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={clearDocuments}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border shadow-sm hover:opacity-90 transition-all ${
                    theme === 'dark'
                      ? 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-55'
                  }`}
                >
                  Clear All
                </button>
              </div>
            )}

            {/* Input form */}
            <form onSubmit={handleSubmit} className="relative w-full">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".txt,.md,.pdf"
                multiple
                className="hidden"
              />

              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isAgentActive ? "TeachTalk is active. Speak into your microphone..." : "Ask a question, ask for a quiz, or outline concepts..."}
                disabled={isLoading || isAgentActive}
                className={`w-full py-4 pl-4 pr-32 rounded-2xl resize-none shadow-sm text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${
                  theme === 'dark'
                    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                    : 'bg-white border-gray-200 text-gray-850 placeholder-gray-400'
                } ${isAgentActive ? 'bg-indigo-500/5 border-indigo-500 cursor-not-allowed placeholder-indigo-405' : ''}`}
              />
              
              <div className="absolute right-3.5 bottom-3.5 flex items-center gap-2">
                {/* File Upload (RAG Document upload) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isAgentActive}
                  className={`p-2 rounded-xl transition-all shadow-sm ${
                    theme === 'dark'
                      ? 'bg-gray-750 text-indigo-400 border border-gray-700 hover:bg-gray-700'
                      : 'bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100/40'
                  } ${isAgentActive ? 'cursor-not-allowed opacity-50' : ''}`}
                  title="Upload study material (.txt, .md)"
                >
                  <Paperclip className="h-5 w-5" />
                </button>

                {/* TeachTalk Microphone (Streaming Voice Agent Toggle) */}
                <button
                  type="button"
                  onClick={handleTeachTalkToggle}
                  disabled={isLoading}
                  className={`p-2 rounded-xl transition-all shadow-sm ${
                    isAgentActive
                      ? 'bg-red-500 text-white animate-pulse'
                      : theme === 'dark'
                        ? 'bg-gray-750 text-indigo-400 border border-gray-700 hover:bg-gray-700'
                        : 'bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100/40'
                  }`}
                  title={isAgentActive ? 'Turn Off Voice Agent (TeachTalk)' : 'Connect Voice Agent (TeachTalk)'}
                >
                  {isAgentActive ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>

                {/* Send Text Button */}
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || isAgentActive}
                  className={`p-2 rounded-xl transition-all ${
                    input.trim() && !isLoading && !isAgentActive
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md active:scale-95'
                      : theme === 'dark'
                        ? 'bg-gray-750 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
            </form>
            <p className={`text-center text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-450'}`}>
              Press Enter to send. Shift+Enter for new line. Click Microphone to connect to **TeachTalk Voice Agent**.
            </p>
          </div>
        </div>
      </main>

      {/* Sidebar background overlay for mobile */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 z-30 md:hidden animate-fade-in"
        />
      )}
    </div>
  );
}