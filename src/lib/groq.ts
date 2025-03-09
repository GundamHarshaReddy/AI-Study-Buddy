const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface ChatMessage {
  role: 'user' | 'assistant'| 'system';
  content: string;
}

interface StreamChunk {
  choices: {
    delta: {
      content?: string;
    };
    index: number;
    finish_reason: string | null;
  }[];
  id: string;
  model: string;
  object: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

const defaultOptions: Required<CompletionOptions> = {
  model: 'mixtral-8x7b-32768',
  temperature: 0.8,
  maxTokens: 2048,
  systemPrompt: `You are an engaging and adaptive AI study buddy. Guidelines:
  - Be natural and conversational
  - Never show formatting instructions or meta-text
  - Never start responses with "AI:" or similar prefixes
  - Don't show asterisks (*) or formatting markers
  - Don't describe your actions in text
  - If the user is inactive, don't suggest follow-up messages
  - Keep responses focused on the user's questions and learning goals
  - Use emojis naturally but don't overdo it
  - Always respond directly to what the user says
  - Stay in character as a helpful study buddy`
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches a streaming chat completion from the Groq API
 * @param messages Array of chat messages
 * @param onChunk Callback function to process each chunk of the response
 * @param options Configuration options for the completion request
 * @returns The complete generated text
 */
export async function getChatCompletion(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options: CompletionOptions = {}
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not found. Please set VITE_GROQ_API_KEY in your environment variables.');
  }

  const config = { ...defaultOptions, ...options };
  
  // Only add system message if this isn't a greeting
  const isGreeting = messages.length === 1 && /^(hi|hello|hey|greetings|sup)/i.test(messages[0].content);
  const systemMessage: ChatMessage = {
    role: 'system',
    content: isGreeting ? 'Respond with a greeting.' : config.systemPrompt
  };

  // Create a clean copy of messages for the API
  const apiMessages = [systemMessage, ...messages].map(msg => ({
    role: msg.role,
    content: msg.content.trim()
  }));

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: apiMessages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        `Failed to get response from Groq: ${response.status} ${response.statusText}` +
        (errorData ? ` - ${JSON.stringify(errorData)}` : '')
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body received from Groq API');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';
    let accumulatedChunks = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      buffer += chunk;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
        
        try {
          const jsonStr = trimmedLine.replace(/^data: /, '');
          const data = JSON.parse(jsonStr) as StreamChunk;
          
          const content = data.choices[0]?.delta?.content || '';
          if (content) {
            accumulatedChunks += content;
            // Send chunks in larger groups for smoother updates
            if (accumulatedChunks.length >= 4 || data.choices[0].finish_reason === 'stop') {
              await sleep(50);
              onChunk(accumulatedChunks);
              fullResponse += accumulatedChunks;
              accumulatedChunks = '';
            }
          }
        } catch (e) {
          console.warn('Error parsing chunk:', trimmedLine, e);
        }
      }
    }

    // Send any remaining chunks
    if (accumulatedChunks) {
      onChunk(accumulatedChunks);
      fullResponse += accumulatedChunks;
    }

    return fullResponse;
  } catch (error) {
    console.error('Error in Groq API request:', error);
    throw error;
  }
}

/**
 * Simple non-streaming version that returns the complete response
 */
export async function getCompletionSync(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<string> {
  let result = '';
  await getChatCompletion(
    messages,
    (chunk) => { result += chunk; },
    options
  );
  return result;
}