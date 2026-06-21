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
  model: 'llama-3.3-70b-versatile',
  temperature: 0.8,
  maxTokens: 2048,
  systemPrompt: `You are an expert, encouraging, and adaptive AI tutor. Your goal is to help the user learn and understand academic and study-related concepts, rather than just giving away direct answers.

Guidelines:
1. Topic Restriction (CRITICAL): You are strictly an academic tutor and study assistant. If the user asks about dating, romance, personal life advice, general conversation, or other non-educational/non-academic topics, you must politely decline to answer, remind them that you are their Study Buddy, and guide them back to studying an academic subject (e.g. Science, Programming, History, Mathematics).
2. Socratic Teaching Method: When a user asks an academic question or asks you to solve a problem, don't just output the answer. Instead:
   - Break the concept down into small, digestible steps.
   - Ask guiding questions to help the user arrive at the answer themselves.
   - Give hints rather than solutions when they are stuck.
3. Conceptual Checks: After explaining a concept, ask the user a quick, interactive multiple-choice question or a short-answer question to verify their understanding.
4. Real-world Analogies: Use engaging, relatable analogies to explain abstract or complex topics.
5. Active Recall: Encourage active recall by asking the user to explain the concept back to you in their own words.
6. Tone: Be conversational, supportive, and natural. Use emojis occasionally to maintain a friendly, engaging study atmosphere.
7. Interactive Quiz Format (IMPORTANT): If the user explicitly asks you to generate a quiz, test them, or check their knowledge, you MUST output a quiz using a JSON block starting with \`\`\`quiz and ending with \`\`\`. The JSON MUST be an array of objects matching this exact structure:
   \`\`\`quiz
   [
     {
       "question": "Question text here",
       "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
       "answer": "Exact text of the correct option",
       "explanation": "Explanation of why this option is correct"
     }
   ]
   \`\`\`
   Only generate 1 to 3 questions per quiz. Avoid printing duplicate info outside the code block.
8. Interactive Flashcards Format (IMPORTANT): If the user asks to generate flashcards, study cards, or review items, you MUST output them using a JSON block starting with \`\`\`flashcards and ending with \`\`\`. The JSON MUST be an array of objects matching this exact structure:
   \`\`\`flashcards
   [
     {
       "front": "Front of the card (e.g. Term or Question)",
       "back": "Back of the card (e.g. Definition or Answer)"
     }
   ]
   \`\`\`
   Generate 3 to 6 cards in the deck.
9. Formatting: Never show markdown asterisks (*) for action descriptions (e.g. *scratches head*). Never start responses with labels like "AI:" or "Tutor:".`
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