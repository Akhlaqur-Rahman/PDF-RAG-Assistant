import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Pinecone } from "@pinecone-database/pinecone";
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { indexPdf } from "./indexPdf.js";
import { askPdf } from "./rag.js";
import crypto from "crypto";
import fs from "fs";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

console.log(
  "Gemini API Key:",
  process.env.GEMINI_API_KEY ? "Loaded ✅" : "Missing ❌"
);

console.log(
  "Pinecone API Key:",
  process.env.PINECONE_API_KEY ? "Loaded ✅" : "Missing ❌"
);

console.log(
  "Pinecone Index:",
  process.env.PINECONE_INDEX_NAME
);

// ==========================================
// PINECONE
// ==========================================

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const pineconeIndex = pinecone.Index(
  process.env.PINECONE_INDEX_NAME
);




// ==========================================
// Middleware
// ==========================================

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://pdf-rag-assistant-7qgf.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Postman/server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked for origin: ${origin}`)
      );
    },

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-gemini-api-key",
      "x-upload-id",
    ],
  })
);


app.use(express.json());


//multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    cb(
      null,
      `${Date.now()}-${safeName}`
    );
  },
});

const upload = multer({
  storage,
});

//hash function
function generateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));

    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });

    stream.on("error", reject);
  });
}


// ==========================================
// Document Metadata Storage
// ==========================================

const DOCUMENTS_FILE = "backend/data/documents.json";

async function readDocuments() {
  try {
    const data = await fs.promises.readFile(
      DOCUMENTS_FILE,
      "utf-8"
    );

    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function saveDocuments(documents) {
  // Make sure data directory exists
  await fs.promises.mkdir(
    "backend/data",
    {
      recursive: true,
    }
  );

  await fs.promises.writeFile(
    DOCUMENTS_FILE,
    JSON.stringify(documents, null, 2),
    "utf-8"
  );
}


// ==========================================
// INDEXING PROGRESS - SSE
// ==========================================

const progressClients = new Map();

app.get("/api/index-progress/:uploadId", (req, res) => {
  const { uploadId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  progressClients.set(uploadId, res);

  console.log("📡 Progress client connected:", uploadId);

  // Initial event
  res.write(
    `data: ${JSON.stringify({
      stage: "connected",
      progress: 0,
      message: "Preparing PDF...",
    })}\n\n`
  );

  req.on("close", () => {
    progressClients.delete(uploadId);

    console.log(
      "📡 Progress client disconnected:",
      uploadId
    );
  });
});

const sendIndexProgress = (uploadId, data) => {
  if (!uploadId) return;

  const client = progressClients.get(uploadId);

  if (!client) return;

  client.write(
    `data: ${JSON.stringify(data)}\n\n`
  );
};


// ==========================================
// Test Route
// ==========================================

app.get("/", (req, res) => {

  res.json({

    success: true,

    message: "PDF RAG API is running 🚀",

  });

});



// ==========================================
// Get All Documents
// ==========================================

app.get("/api/documents", async (req, res) => {
  try {
    const documents = await readDocuments();

    // Latest uploaded document first
    documents.sort(
      (a, b) =>
        new Date(b.uploadedAt) -
        new Date(a.uploadedAt)
    );

    return res.status(200).json({
      success: true,
      count: documents.length,
      documents,
    });

  } catch (error) {
    console.error(
      "❌ Failed to get documents:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load documents",
      error: error.message,
    });
  }
});


// ==========================================
// Delete Document
// ==========================================

app.delete("/api/documents/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!documentId?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Document ID is required",
      });
    }

    console.log(
      "\n🗑️ Deleting document:",
      documentId
    );

    // ==========================================
    // 1. CHECK LOCAL METADATA
    // ==========================================

    const documents = await readDocuments();

    const documentExists = documents.some(
      (doc) => doc.documentId === documentId
    );

    if (!documentExists) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }


    // ==========================================
    // 2. DELETE PINECONE NAMESPACE
    // ==========================================

    console.log(
      "🌲 Deleting Pinecone vectors..."
    );

    const namespace =
      pineconeIndex.namespace(documentId);

    try {
      await namespace.deleteAll();

      console.log(
        "✅ Pinecone namespace deleted"
      );

    } catch (pineconeError) {

      // ========================================
      // Namespace/vectors already don't exist
      // ========================================

      if (
        pineconeError?.status === 404 ||
        pineconeError?.name ===
          "PineconeNotFoundError"
      ) {
        console.log(
          "⚠️ Pinecone namespace already empty/not found"
        );

        console.log(
          "➡️ Continuing metadata deletion..."
        );

      } else {
        // Actual Pinecone problem
        throw pineconeError;
      }
    }


    // ==========================================
    // 3. DELETE DOCUMENT METADATA
    // ==========================================

    const updatedDocuments =
      documents.filter(
        (doc) =>
          doc.documentId !== documentId
      );

    await saveDocuments(updatedDocuments);

    console.log(
      "✅ Document metadata deleted"
    );


    // ==========================================
    // 4. RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      message:
        "Document deleted successfully",

      documentId,
    });

  } catch (error) {

    console.error(
      "❌ Delete Document Error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to delete document",

      error:
        error.message,
    });
  }
});


// Validate user's Gemini API Key
// ==========================================

app.post("/api/validate-key", async (req, res) => {
  try {
    const { apiKey } = req.body || {};

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return res.status(400).json({
        success: false,
        message: "Gemini API key is required",
      });
    }

    const userApiKey = apiKey.trim();

    console.log("🔑 Validating Gemini API key...");

    // IMPORTANT:
    // User ki key se temporary model create hoga
    const testModel = new ChatGoogleGenerativeAI({
      apiKey: userApiKey,

      // Tumhare project me working model use karo
      model:  "gemini-3.5-flash-lite",
    });

    // Smallest possible test request
    const response = await testModel.invoke(
      "Reply with only: OK"
    );

    console.log("✅ Gemini API key is valid");

    return res.status(200).json({
      success: true,
      message: "Gemini API key connected successfully",
    });

  } catch (error) {
    console.error("\n❌ GEMINI KEY VALIDATION ERROR");
    console.error("Message:", error.message);
    console.error("Status:", error.status);
    console.error("Name:", error.name);

    return res.status(401).json({
      success: false,
      message: "Invalid or unusable Gemini API key",
      error: error.message,
    });
  }
});




// ==========================================
// Query Route
// ==========================================

app.post("/api/query", async (req, res) => {
  try {
    const {
      question,
      documentId
    } = req.body || {};

    const geminiApiKey =
      req.headers["x-gemini-api-key"];

    // ==========================================
    // QUESTION VALIDATION
    // ==========================================

    if (!question?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Question is required",
      });
    }

    // ==========================================
    // DOCUMENT VALIDATION
    // ==========================================

    if (!documentId?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Document ID is required",
      });
    }

    // ==========================================
    // GEMINI KEY VALIDATION
    // ==========================================

    if (
      !geminiApiKey ||
      typeof geminiApiKey !== "string" ||
      !geminiApiKey.trim()
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Gemini API key is required.",
      });
    }

    console.log("\n=================================");
    console.log("❓ New Question");
    console.log("Question:", question);
    console.log("Document:", documentId);
    console.log("=================================");

    // ==========================================
    // RAG
    // ==========================================

    const result =
      await askPdf(
        question.trim(),
        documentId.trim(),
        geminiApiKey.trim()
      );

    return res.status(200).json({
      success: true,

      question: question.trim(),

      documentId:
        documentId.trim(),

      answer:
        result.answer,

      sources:
        result.sources,
    });

  } catch (error) {
    console.error(
      "❌ Query Error:",
      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to process question",

      error:
        error.message,
    });
  }
});


//upload route
app.post( "/api/upload",
  upload.single("pdf"),
  async (req, res) => {

    try {
      const uploadId = req.headers["x-upload-id"];
      // =========================================
      // FILE CHECK
      // =========================================

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please upload a PDF file.",
        });
      }

      console.log("\n📄 PDF Uploaded");
      console.log("Name:", req.file.originalname);



      sendIndexProgress(uploadId, {
  stage: "upload",
  progress: 5,
  message: "PDF uploaded successfully",
});

      // =========================================
      // GEMINI API KEY
      // =========================================

      const geminiApiKey =
        req.headers["x-gemini-api-key"];

      if (
        !geminiApiKey ||
        typeof geminiApiKey !== "string" ||
        !geminiApiKey.trim()
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Gemini API key is required. Please connect your API key first.",
        });
      }


      sendIndexProgress(uploadId, {
  stage: "processing",
  progress: 10,
  message: "Analyzing PDF...",
});

      // =========================================
      // GENERATE HASH
      // =========================================

      const fileHash =
        await generateFileHash(req.file.path);

      const documentId =
        `doc-${fileHash.substring(0, 16)}`;

      console.log(
        "Document ID:",
        documentId
      );


      // =========================================
      // INDEX PDF
      // =========================================

      const indexingResult =
        await indexPdf(
          req.file.path,
          documentId,
          geminiApiKey.trim(),

            (progressData) => {
    sendIndexProgress(uploadId, progressData);
  }
        );


      // =========================================
      // DOCUMENT METADATA
      // =========================================

      const documents =
        await readDocuments();

      const existingDocument =
        documents.find(
          (doc) =>
            doc.documentId === documentId
        );


      if (!existingDocument) {

        documents.push({
          documentId,

          originalName:
            req.file.originalname,

          size:
            req.file.size,

          uploadedAt:
            new Date().toISOString(),
        });

        await saveDocuments(documents);

        console.log(
          "💾 Document metadata saved"
        );

      } else {

        console.log(
          "♻️ Document already exists in history"
        );
      }
       

      sendIndexProgress(uploadId, {
  stage: "complete",
  progress: 100,
  message: "PDF ready for questions",
});

      // =========================================
      // RESPONSE
      // =========================================

      return res.status(200).json({
        success: true,

        message:
          indexingResult.alreadyIndexed
            ? "PDF already exists and is ready for questions"
            : "PDF uploaded and indexed successfully",

        document: {
          documentId,

          originalName:
            req.file.originalname,

          size:
            req.file.size,
        },

        indexing:
          indexingResult,
      });

    } catch (error) {

      console.error(
        "❌ Upload/Index Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to upload/index PDF",
        error:
          error.message,
      });

    } finally {

      // =========================================
      // ALWAYS DELETE TEMPORARY PDF
      // =========================================

      if (req.file?.path) {

        try {

          await fs.promises.unlink(
            req.file.path
          );

          console.log(
            "🧹 Temporary PDF deleted:",
            req.file.filename
          );

        } catch (cleanupError) {

          // Ignore if file already deleted
          if (
            cleanupError.code !== "ENOENT"
          ) {
            console.error(
              "⚠️ Temporary PDF cleanup failed:",
              cleanupError.message
            );
          }
        }
      }
    }
  }
);


// ==========================================
// Start Server
// ==========================================

const PORT =
  process.env.PORT || 5000;


app.listen(PORT, () => {

  console.log(
    `🚀 Server running on http://localhost:${PORT}`
  );

});