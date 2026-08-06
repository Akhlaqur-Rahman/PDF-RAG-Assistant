# 📄 PDF RAG Assistant

An AI-powered PDF Question Answering application built using React, Node.js, Gemini AI, LangChain, and Pinecone.

PDF RAG Assistant allows users to upload PDF documents, index their content using vector embeddings, and ask natural-language questions about the uploaded documents using a Retrieval-Augmented Generation (RAG) pipeline.

---

## ✨ Features

- 📤 Upload and process PDF documents
- 🧠 AI-powered question answering
- 🔍 Retrieval-Augmented Generation (RAG)
- ⚡ Real-time PDF indexing progress
- 📚 Multiple PDF document management
- 💬 Separate chat history for each PDF
- 📖 Relevant source/page references
- ♻️ Duplicate PDF detection
- 🚀 Reuses existing Pinecone vectors for previously indexed PDFs
- 🔑 User-provided Gemini API key
- 🗑️ Delete uploaded documents
- 📊 Chunk-based indexing progress
- 🔒 API keys are not stored in the repository
- 🧹 Temporary uploaded PDFs are removed after processing



## 🛠️ Tech Stack

### Frontend

- React.js
- Vite
- Axios
- React Markdown
- Lucide React
- CSS

### Backend

- Node.js
- Express.js
- Multer
- Server-Sent Events (SSE)
- PDF Loader

### AI & RAG

- Google Gemini
- Gemini Embeddings
- LangChain
- Recursive Character Text Splitter
- Pinecone Vector Database
- Retrieval-Augmented Generation (RAG)

---

## 🧠 How It Works

The application follows a Retrieval-Augmented Generation pipeline:

text
PDF Upload
    ↓
PDF Parsing
    ↓
Text Extraction
    ↓
Text Chunking
    ↓
Gemini Embeddings
    ↓
Pinecone Vector Database
    ↓
User Question
    ↓
Question Embedding
    ↓
Similarity Search
    ↓
Relevant PDF Chunks
    ↓
Gemini LLM
    ↓
AI Generated Answer


### 1. PDF Upload

The user selects and uploads a PDF from the React frontend.

### 2. Document Identification

The backend generates a hash-based document ID for the PDF.

This helps identify duplicate documents and prevents unnecessary re-indexing.

### 3. PDF Processing

The uploaded PDF is parsed and its text content is extracted.

### 4. Text Chunking

The extracted text is divided into smaller overlapping chunks using LangChain's `RecursiveCharacterTextSplitter`.

### 5. Embedding Generation

Each chunk is converted into a vector embedding using Google's Gemini embedding model.

### 6. Vector Storage

The embeddings and associated metadata are stored in Pinecone using a document-specific namespace.

### 7. Duplicate Detection

Before indexing, the backend checks whether the PDF has already been indexed.

If vectors already exist:

text
PDF Loading      → Skipped
Text Chunking    → Skipped
Gemini Embedding → Skipped
Pinecone Upsert  → Skipped


Existing vectors are reused instead.

### 8. Question Answering

When a user asks a question:

1. The question is converted into an embedding.
2. Pinecone performs similarity search.
3. Relevant PDF chunks are retrieved.
4. Retrieved context is sent to Gemini.
5. Gemini generates an answer based on the retrieved PDF content.

---

## ⚡ Real-Time Indexing Progress

PDF indexing progress is streamed from the backend to the frontend using **Server-Sent Events (SSE)**.

Example:

text
Reading PDF...
      ↓
Splitting document into chunks...
      ↓
Indexing 1/19 chunks
      ↓
Indexing 10/19 chunks
      ↓
Indexing 19/19 chunks
      ↓
PDF ready for questions


This allows users to monitor indexing progress without refreshing the page.

---

## 📂 Project Structure

```text
PDF-RAG-Assistant/
│
├── backend/
│   ├── data/
│   │   └── .gitkeep
│   │
│   ├── uploads/
│   │   └── .gitkeep
│   │
│   ├── indexPdf.js
│   ├── rag.js
│   ├── server.js
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── public/
│   │
│   ├── src/
│   │   ├── assets/
│   │   │
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   └── Sidebar.css
│   │   │
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

---



## Clone the Repository


git clone https://github.com/Akhlaqur-Rahman/PDF-RAG-Assistant.git




## 🔑 Gemini API Key

The application allows the user to connect their own **Google Gemini API key** from the frontend.

The key is used for:

- Generating embeddings
- Processing RAG queries
- Generating AI answers

The user's Gemini API key should never be committed to GitHub.

---

## 🌲 Pinecone Configuration

Create a Pinecone index compatible with the embedding model used by the application.

The current application expects vectors with:

text
Dimension: 3072


The application uses a separate Pinecone namespace for each PDF document.

Example:

text
doc-05af7062ec7d51c3


This keeps vectors belonging to different PDFs isolated.


## 📡 API Overview

The backend provides APIs for functionality such as:

text
PDF Upload
PDF Indexing
Document Management
RAG Question Answering
Gemini API Validation
Indexing Progress


Real-time indexing updates are delivered through an SSE endpoint.

---

## 🔄 Duplicate PDF Handling

Each uploaded PDF receives a deterministic document ID generated from its file hash.

If the same PDF is uploaded again, the application checks Pinecone before generating new embeddings.

```text
Same PDF
   ↓
Same Document Hash
   ↓
Same Document ID
   ↓
Check Pinecone
   ↓
Vectors Exist?
   ↓
YES
   ↓
Reuse Existing Vectors
```

This reduces unnecessary embedding requests and indexing operations.

---

## 🛡️ Security

Sensitive credentials should never be committed to the repository.

The project follows these practices:

- `.env` excluded from Git
- `node_modules` excluded from Git
- Temporary PDF uploads excluded from Git
- User Gemini API key supplied at runtime
- Temporary PDF files removed after processing

---

## 🔮 Future Improvements

Potential improvements include:

- User authentication
- Cloud-based document metadata storage
- Persistent chat history database
- Streaming AI responses
- Advanced citation highlighting
- PDF preview
- Conversation export
- Multiple document querying
- Hybrid search
- RAG evaluation
- Docker support
- Production deployment

---

## 👨‍💻 Author

Akhlaqur Rahman

Full-Stack Developer | MERN Stack | Generative AI

GitHub: `https://github.com/Akhlaqur-Rahman`

---

## ⭐ Support

If you find this project useful, consider giving the repository a ⭐.

Contributions, suggestions, and feedback are welcome.