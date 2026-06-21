export interface DocumentChunk {
  id: string;
  fileName: string;
  text: string;
}

/**
 * Splits text into overlapping chunks of a given size.
 */
export function chunkText(fileName: string, text: string, chunkSize = 800, overlap = 200): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let index = 0;
  
  if (text.length <= chunkSize) {
    chunks.push({
      id: `${fileName}-${index}`,
      fileName,
      text: text.trim()
    });
    return chunks;
  }

  while (index < text.length) {
    const chunkText = text.substring(index, index + chunkSize).trim();
    if (chunkText.length > 50) { // Discard tiny trailing chunks
      chunks.push({
        id: `${fileName}-${index}`,
        fileName,
        text: chunkText
      });
    }
    index += (chunkSize - overlap);
  }

  return chunks;
}

/**
 * Tokenizes and lowercases text, removing punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(token => token.length > 2); // Filter out short stop words like "a", "is", "to"
}

/**
 * Ranks chunks by relevance to the query using simple TF-IDF.
 */
export function searchChunks(query: string, chunks: DocumentChunk[], limit = 3): DocumentChunk[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || chunks.length === 0) return [];

  // Compute document counts for IDF
  const docCounts: Record<string, number> = {};
  queryTokens.forEach(token => {
    docCounts[token] = 0;
    chunks.forEach(chunk => {
      if (chunk.text.toLowerCase().includes(token)) {
        docCounts[token]++;
      }
    });
  });

  // Calculate scores for each chunk
  const scoredChunks = chunks.map(chunk => {
    const chunkTokens = tokenize(chunk.text);
    const tokenCounts: Record<string, number> = {};
    chunkTokens.forEach(token => {
      tokenCounts[token] = (tokenCounts[token] || 0) + 1;
    });

    let score = 0;
    queryTokens.forEach(token => {
      const tf = (tokenCounts[token] || 0) / Math.max(chunkTokens.length, 1);
      // IDF smoothing to avoid division by zero
      const idf = Math.log(chunks.length / (docCounts[token] || 1) + 1);
      score += tf * idf;
    });

    // Score booster if multiple exact keyword matches are present
    let matchesCount = 0;
    queryTokens.forEach(token => {
      if (chunk.text.toLowerCase().includes(token)) {
        matchesCount++;
      }
    });
    
    // Add bonus multiplier for search relevance
    score = score * (1 + matchesCount * 0.2);

    return { chunk, score };
  });

  // Sort by score descending and filter out zero scores
  return scoredChunks
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.chunk);
}
