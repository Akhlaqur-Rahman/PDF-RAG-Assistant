
import dotenv from "dotenv";
dotenv.config();

import {
  GoogleGenerativeAIEmbeddings,
  ChatGoogleGenerativeAI,
} from "@langchain/google-genai";

import { Pinecone } from "@pinecone-database/pinecone";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";

// =====================================================
// PINECONE
// =====================================================

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const pineconeIndex = pinecone.Index(
  process.env.PINECONE_INDEX_NAME
);

// =====================================================
// PROMPT
// =====================================================

const promptTemplate = PromptTemplate.fromTemplate(`
You are a helpful AI assistant answering questions using only the provided PDF context.

Context from the PDF:
{context}

Question:
{question}

Instructions:
- Answer ONLY from the provided context.
- Do not use outside knowledge.
- If the answer is not available in the context, say:
  "I don't have enough information in this PDF to answer that question."
- Be clear and concise.
- Use Markdown formatting when useful.
- Use code examples from the context if relevant.

Answer:
`);

// =====================================================
// RAG QUERY
// =====================================================

export async function askPdf(
  question,
  documentId,
  geminiApiKey
) {
  // ===================================================
  // 1. VALIDATION
  // ===================================================

  if (!question?.trim()) {
    throw new Error("Question is required");
  }

  if (!documentId?.trim()) {
    throw new Error("Document ID is required");
  }

  if (!geminiApiKey?.trim()) {
    throw new Error("Gemini API key is required");
  }

  console.log("\n🔎 Processing query...");
  console.log("Question:", question);
  console.log("Document:", documentId);

  // Never log geminiApiKey

  // ===================================================
  // 2. CREATE USER-SPECIFIC EMBEDDINGS CLIENT
  // ===================================================

  const embeddings =
    new GoogleGenerativeAIEmbeddings({
      apiKey: geminiApiKey.trim(),
      model: "gemini-embedding-001",
    });

  // ===================================================
  // 3. CREATE USER-SPECIFIC GEMINI MODEL
  // ===================================================

  const model =
    new ChatGoogleGenerativeAI({
      apiKey: geminiApiKey.trim(),

      // Keep your currently working model in .env
      model: process.env.GEMINI_MODEL,

      temperature: 0.3,
    });

  console.log(
    "🔑 Using user's Gemini API key for RAG"
  );

  // ===================================================
  // 4. CREATE QUESTION EMBEDDING
  // ===================================================

  const queryVector =
    await embeddings.embedQuery(
      question.trim()
    );

  if (
    !queryVector ||
    queryVector.length !== 3072
  ) {
    throw new Error(
      `Invalid query embedding dimension: ${
        queryVector?.length ?? 0
      }`
    );
  }

  // ===================================================
  // 5. SELECT PDF NAMESPACE
  // ===================================================

  const namespace =
    pineconeIndex.namespace(
      documentId.trim()
    );

  // ===================================================
  // 6. SEARCH ONLY THIS PDF
  // ===================================================

  const searchResults =
    await namespace.query({
      topK: 5,
      vector: queryVector,
      includeMetadata: true,
    });

  console.log(
    `Retrieved ${
      searchResults.matches?.length ?? 0
    } chunks`
  );

  // ===================================================
  // 7. NO RESULTS
  // ===================================================

  if (
    !searchResults.matches ||
    searchResults.matches.length === 0
  ) {
    return {
      answer:
        "I couldn't find relevant information in this PDF.",
      sources: [],
    };
  }

  // ===================================================
  // 8. CREATE CONTEXT
  // ===================================================

  const context =
    searchResults.matches
      .map((match, index) => {
        return `
SOURCE ${index + 1}
Page: ${match.metadata?.page ?? "Unknown"}

${match.metadata?.text ?? ""}
`;
      })
      .join(
        "\n\n-------------------------\n\n"
      );

  // ===================================================
  // 9. RAG CHAIN
  // ===================================================

  const chain =
    RunnableSequence.from([
      promptTemplate,
      model,
      new StringOutputParser(),
    ]);

  // ===================================================
  // 10. GENERATE ANSWER
  // ===================================================

  const answer =
    await chain.invoke({
      context,
      question: question.trim(),
    });

  // ===================================================
  // 11. FORMAT SOURCES
  // ===================================================

  const sources =
    searchResults.matches.map(
      (match, index) => ({
        source: index + 1,

        score:
          typeof match.score === "number"
            ? Number(
                match.score.toFixed(4)
              )
            : 0,

        page:
          match.metadata?.page ?? 0,

        text:
          match.metadata?.text ?? "",
      })
    );

  return {
    answer,
    sources,
  };
}
