
import dotenv from "dotenv";
dotenv.config();

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Pinecone } from "@pinecone-database/pinecone";


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
// INDEX PDF
// User's Gemini API key will come from server.js
// =====================================================

export async function indexPdf(
  filePath,
  documentId,
  geminiApiKey,
  onProgress = () => {}
)  {
  console.log("\n📄 Starting PDF indexing...");
  console.log("Document ID:", documentId);


  // =====================================================
  // 1. GET PDF-SPECIFIC NAMESPACE
  // =====================================================

  const namespace = pineconeIndex.namespace(documentId);


  // =====================================================
  // 2. CHECK DUPLICATE FIRST
  //
  // IMPORTANT:
  // Gemini embeddings object bhi abhi create nahi hoga.
  // =====================================================

  const firstVectorId = `${documentId}-chunk-0`;

  console.log(
    "🔍 Checking if PDF is already indexed..."
  );

  try {
    const existing = await namespace.fetch([
      firstVectorId,
    ]);

    const records =
      existing.records ||
      existing.vectors ||
      {};


    // ===================================================
    // PDF ALREADY EXISTS
    // ===================================================

    if (records[firstVectorId]) {
      console.log("♻️ PDF already indexed!");
      console.log("⚡ Skipping PDF loading.");
      console.log("⚡ Skipping chunking.");
      console.log("⚡ Skipping Gemini embeddings.");
      console.log("⚡ Skipping Pinecone indexing.");
      console.log("Document ID:", documentId);

       onProgress({
    stage: "complete",
    progress: 100,
    message:
      "PDF already indexed — existing vectors reused",
  });

      return {
        documentId,
        alreadyIndexed: true,
        uploaded: 0,
        skipped: 0,
      };
    }


    console.log("🆕 New PDF detected.");
    console.log("➡️ Starting PDF processing...");

  } catch (error) {
    console.log(
      "⚠️ Could not check existing document:",
      error.message
    );

    console.log(
      "➡️ Continuing with PDF indexing..."
    );
  }


  // =====================================================
  // 3. VALIDATE USER GEMINI API KEY
  // Only needed when PDF is NEW
  // =====================================================

  if (
    !geminiApiKey ||
    typeof geminiApiKey !== "string" ||
    !geminiApiKey.trim()
  ) {
    throw new Error(
      "Gemini API key is required for indexing"
    );
  }


  // =====================================================
  // 4. CREATE EMBEDDINGS USING USER'S API KEY
  // =====================================================

  console.log(
    "🔑 Using user's Gemini API key for embeddings"
  );

  const embeddings =
    new GoogleGenerativeAIEmbeddings({
      apiKey: geminiApiKey.trim(),
      model: "gemini-embedding-001",
    });

   

    onProgress({
  stage: "loading",
  progress: 15,
  message: "Reading PDF...",
});

  // =====================================================
  // 5. LOAD PDF
  // Only happens for NEW PDF
  // =====================================================

  let docs;

try {
  const loader = new PDFLoader(filePath);

  docs = await loader.load();

  if (!docs || docs.length === 0) {
    throw new Error(
      "No readable content found in PDF"
    );
  }

  console.log("✅ PDF loaded");
  console.log(`Pages: ${docs.length}`);

} catch (error) {
  console.error(
    "❌ PDF parsing failed:",
    error.message
  );

  if (
    error.message?.includes(
      "Invalid PDF structure"
    )
  ) {
    throw new Error(
      "This PDF has an invalid or unsupported structure. Please re-save/export the PDF and try again."
    );
  }

  throw new Error(
    `Unable to read PDF: ${error.message}`
  );
}



onProgress({
  stage: "chunking",
  progress: 25,
  message: "Splitting document into chunks...",
});

  // =====================================================
  // 6. CREATE CHUNKS
  // =====================================================

  console.log("\n✂️ Creating chunks...");

  const splitter =
    new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

  let chunks =
    await splitter.splitDocuments(docs);


  // =====================================================
  // 7. REMOVE EMPTY CHUNKS
  // =====================================================

  chunks = chunks.filter(
    (doc) =>
      typeof doc.pageContent === "string" &&
      doc.pageContent.trim().length > 0
  );

  console.log(`Chunks: ${chunks.length}`);


  // =====================================================
  // 8. COUNTERS
  // =====================================================

  let uploaded = 0;
  let skipped = 0;


  // =====================================================
  // 9. PROCESS EACH CHUNK
  // =====================================================

  console.log(
    "\n🧠 Starting embedding + indexing...\n"
  );


  for (let i = 0; i < chunks.length; i++) {

    const doc = chunks[i];

    try {

      // =================================================
      // CLEAN TEXT
      // =================================================

      const cleanText = doc.pageContent
        .replace(/\u0000/g, "")
        .replace(/\r/g, "\n")
        .trim();


      if (!cleanText) {

        console.log(
          `⚠️ Empty chunk ${i + 1} skipped`
        );

        skipped++;

        continue;
      }


      // =================================================
      // GENERATE EMBEDDING
      // USING USER'S GEMINI API KEY
      // =================================================

      let vector =
        await embeddings.embedQuery(cleanText);


      // =================================================
      // RETRY ON INVALID VECTOR
      // =================================================

      if (
        !vector ||
        vector.length !== 3072
      ) {

        console.log(
          `⚠️ Invalid embedding for chunk ${
            i + 1
          }. Retrying...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, 1000)
        );


        vector =
          await embeddings.embedQuery(cleanText);
      }


      // =================================================
      // STILL INVALID → SKIP
      // =================================================

      if (
        !vector ||
        vector.length !== 3072
      ) {

        console.log(
          `❌ Invalid embedding for chunk ${
            i + 1
          }`
        );

        skipped++;

        continue;
      }


      // =================================================
      // UPLOAD VECTOR TO PINECONE
      // =================================================

      await namespace.upsert([
        {
          id: `${documentId}-chunk-${i}`,

          values: vector,

          metadata: {

            text: cleanText,

            page:
              doc.metadata?.loc?.pageNumber ??
              doc.metadata?.pageNumber ??
              0,

            documentId,

            source: filePath,
          },
        },
      ]);


     uploaded++;

const total = chunks.length;

const percentage =
  30 + Math.round(
    ((uploaded + skipped) / total) * 65
  );

onProgress({
  stage: "indexing",
  progress: percentage,
  current: uploaded,
  total,
  message:
    `Indexed ${uploaded}/${total} chunks`,
});


      console.log(
        `✅ Indexed ${uploaded}/${chunks.length}`
      );


      // =================================================
      // SMALL DELAY
      // =================================================

      await new Promise((resolve) =>
        setTimeout(resolve, 100)
      );

    } catch (error) {

      skipped++;

      console.error(
        `❌ Chunk ${i + 1} failed:`,
        error.message
      );
    }
  }


  // =====================================================
  // 10. COMPLETE
  // =====================================================

  console.log("\n====================================");
  console.log("🎉 PDF INDEXING COMPLETED");
  console.log(`Document: ${documentId}`);
  console.log(`Total Chunks: ${chunks.length}`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped: ${skipped}`);
  console.log("====================================");

onProgress({
  stage: "complete",
  progress: 100,
  current: chunks.length,
  total: chunks.length,
  message:
    "PDF indexed successfully — ready for questions",
});

  return {
    documentId,
    alreadyIndexed: false,
    totalChunks: chunks.length,
    uploaded,
    skipped,
  };
}