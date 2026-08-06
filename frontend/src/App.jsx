import { useEffect, useState } from "react";
import axios from "axios";
import "./index.css";
import ReactMarkdown from "react-markdown";

import {
  Send,
  Bot,
  User,
  BookOpen,
  Trash2,
  X,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  FileText,
} from "lucide-react";
import Sidebar from "./components/Sidebar";

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
const [documentId, setDocumentId] = useState(null);
const [documentName, setDocumentName] = useState("");
const [uploading, setUploading] = useState(false);
const [uploadError, setUploadError] = useState("");

const [alreadyIndexed, setAlreadyIndexed] = useState(false);
const [documents, setDocuments] = useState([]);
const [documentsLoading, setDocumentsLoading] = useState(false);

const [geminiApiKey, setGeminiApiKey] = useState(
  () => sessionStorage.getItem("gemini-api-key") || ""
);

const [showApiKey, setShowApiKey] = useState(false);

const [apiKeyConnected, setApiKeyConnected] = useState(
  () =>
    sessionStorage.getItem("gemini-api-connected") === "true"
);

const [validatingKey, setValidatingKey] = useState(false);
const [apiKeyError, setApiKeyError] = useState("");
const [openSources, setOpenSources] = useState({});

const [deleteTarget, setDeleteTarget] = useState(null);
const [deleting, setDeleting] = useState(false);

const [restoringApiKey, setRestoringApiKey] = useState(true);

const [toast, setToast] = useState({
  show: false,
  message: "",
  type: "success",
});

const [indexProgress, setIndexProgress] = useState(0);
const [indexStatus, setIndexStatus] = useState("");
const [indexedChunks, setIndexedChunks] = useState({
  current: 0,
  total: 0,
});


const showToast = (message, type = "success") => {
  setToast({
    show: true,
    message,
    type,
  });

  setTimeout(() => {
    setToast({
      show: false,
      message: "",
      type: "success",
    });
  }, 3000);
};
 
useEffect(() => {
  if (!documentId) return;

  localStorage.setItem(
    `pdf-chat-${documentId}`,
    JSON.stringify(messages)
  );
}, [messages, documentId]);

//restoring gemini connection
useEffect(() => {
  const restoreGeminiConnection = async () => {
    const savedKey =
      sessionStorage.getItem("gemini-api-key");

    if (!savedKey) {
      setRestoringApiKey(false);
      return;
    }

    try {
      const response = await axios.post(
        "http://localhost:5000/api/validate-key",
        {
          apiKey: savedKey,
        }
      );

      if (response.data.success) {
        setGeminiApiKey(savedKey);
        setApiKeyConnected(true);

        sessionStorage.setItem(
          "gemini-api-connected",
          "true"
        );
      }
    } catch (error) {
      console.error(
        "Saved Gemini key validation failed:",
        error
      );

      sessionStorage.removeItem(
        "gemini-api-key"
      );

      sessionStorage.removeItem(
        "gemini-api-connected"
      );

      setGeminiApiKey("");
      setApiKeyConnected(false);
    } finally {
      setRestoringApiKey(false);
    }
  };

  restoreGeminiConnection();
}, []);

//fetch document
const fetchDocuments = async () => {
  try {
    setDocumentsLoading(true);

    const response = await axios.get(
      "http://localhost:5000/api/documents"
    );

    setDocuments(response.data.documents || []);

    console.log(
      "📚 Documents:",
      response.data.documents
    );
  } catch (error) {
    console.error(
      "Failed to load documents:",
      error
    );
  } finally {
    setDocumentsLoading(false);
  }
};

useEffect(() => {
  fetchDocuments();
}, []);

//document select func
const selectDocument = (doc) => {
  setDocumentId(doc.documentId);
  setDocumentName(doc.originalName);

  setSelectedFile(null);
  setAlreadyIndexed(true);

 // Load this PDF's previous chat
  const savedChat = localStorage.getItem(
    `pdf-chat-${doc.documentId}`
  );

  if (savedChat) {
    try {
      setMessages(JSON.parse(savedChat));
    } catch {
      setMessages([]);
    }
  } else {
    setMessages([]);
  }

  setQuestion("");
  setUploadError("");

  console.log("📄 Selected document:", doc.originalName);
  console.log("Document ID:", doc.documentId);
};

//delete func
const deleteDocument = async (doc, event) => {
  // Document card click hone se prevent karega
    event?.stopPropagation();

      setDeleteTarget(doc);
};


// ==========================================
// CONFIRM DELETE
// ==========================================
 const confirmDeleteDocument = async () => {
  if (!deleteTarget || deleting) return;

  try {
    setDeleting(true);

    const doc = deleteTarget;

    await axios.delete(
      `http://localhost:5000/api/documents/${doc.documentId}`
    );

    // Remove chat history
    localStorage.removeItem(
      `pdf-chat-${doc.documentId}`
    );

    // Agar currently opened PDF delete hui
    if (documentId === doc.documentId) {
      setDocumentId(null);
      setDocumentName("");
      setSelectedFile(null);
      setAlreadyIndexed(false);
      setMessages([]);
      setQuestion("");
    }

    // Close modal
    setDeleteTarget(null);

    // Refresh sidebar
    await fetchDocuments();

    showToast(
      `"${doc.originalName}" deleted successfully.`,
      "success"
    );

  } catch (error) {
    console.error(
      "Delete document error:",
      error.response?.data || error
    );

    showToast(
      error.response?.data?.message ||
        "Failed to delete document.",
      "error"
    );

  } finally {
    setDeleting(false);
  }
};


//upload 
const uploadPdf = async () => {
  if (!selectedFile) return;

  if (!apiKeyConnected || !geminiApiKey.trim()) {
    setUploadError(
      "Please connect your Gemini API key first."
    );
    return;
  }

  // ==========================================
  // RESET UPLOAD / PROGRESS STATE
  // ==========================================

  setUploading(true);
  setUploadError("");
  setAlreadyIndexed(false);

  setIndexProgress(0);
  setIndexStatus("Preparing PDF...");
  setIndexedChunks({
    current: 0,
    total: 0,
  });

  // Unique ID for this upload
  const uploadId =
    `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2)}`;

  let eventSource = null;

  try {
    // ==========================================
    // CONNECT TO SSE PROGRESS STREAM
    // ==========================================

    eventSource = new EventSource(
      `http://localhost:5000/api/index-progress/${uploadId}`
    );

    await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(
      new Error("Progress connection timeout")
    );
  }, 5000);

    eventSource.onopen = () => {
        clearTimeout(timeout);
      console.log(
        "📡 Connected to indexing progress"
      );
      resolve();
    };

      eventSource.onerror = (error) => {
    clearTimeout(timeout);

    console.error(
      "❌ SSE connection failed:",
      error
    );

    reject(
      new Error(
        "Unable to connect to progress stream"
      )
    );
  };
  });

    eventSource.onmessage = (event) => {
      try {
        const progressData =
          JSON.parse(event.data);

        console.log(
          "📊 Index progress:",
          progressData
        );

        // Percentage
        if (
          typeof progressData.progress ===
          "number"
        ) {
          setIndexProgress(
            progressData.progress
          );
        }

        // Status text
        if (progressData.message) {
          setIndexStatus(
            progressData.message
          );
        }

        // Chunk progress
        if (
          typeof progressData.current ===
            "number" &&
          typeof progressData.total ===
            "number"
        ) {
          setIndexedChunks({
            current: progressData.current,
            total: progressData.total,
          });
        }

        // Complete
      if (
  progressData.stage === "complete" ||
  progressData.progress === 100
) {
  setIndexProgress(100);

  console.log(
    "✅ Indexing progress completed"
  );
}
      } catch (error) {
        console.error(
          "Progress parse error:",
          error
        );
      }
    };

 

    // eventSource.onerror = (error) => {
    //   console.warn(
    //     "⚠️ Progress connection closed/error:",
    //     error
    //   );

    //   eventSource?.close();
    // };

    // ==========================================
    // PREPARE PDF
    // ==========================================

    const formData = new FormData();

    formData.append(
      "pdf",
      selectedFile
    );

    // ==========================================
    // UPLOAD PDF
    // ==========================================

    const response = await axios.post(
      "http://localhost:5000/api/upload",
      formData,
      {
        headers: {
          "x-gemini-api-key":
            geminiApiKey.trim(),

          "x-upload-id":
            uploadId,
        },
      }
    );

    const data = response.data;

    // ==========================================
    // SAVE CURRENT DOCUMENT
    // ==========================================

    const newDocumentId =
      data.document.documentId;

    setDocumentId(
      newDocumentId
    );

    setDocumentName(
      data.document.originalName
    );

    // Selected temporary file clear
    setSelectedFile(null);

    // ==========================================
    // CHECK DUPLICATE / NEW PDF
    // ==========================================

    const isAlreadyIndexed =
      data.indexing?.alreadyIndexed === true;

    setAlreadyIndexed(
      isAlreadyIndexed
    );

    // ==========================================
    // COMPLETE PROGRESS
    // ==========================================

    setIndexProgress(100);

    setIndexStatus(
      isAlreadyIndexed
        ? "PDF already indexed — ready for questions"
        : "PDF indexed successfully — ready for questions"
    );

    // ==========================================
    // RESTORE PDF CHAT
    // ==========================================

    const savedChat =
      localStorage.getItem(
        `pdf-chat-${newDocumentId}`
      );

    if (savedChat) {
      try {
        setMessages(
          JSON.parse(savedChat)
        );
      } catch {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }

    // ==========================================
    // REFRESH DOCUMENT LIST
    // ==========================================

    await fetchDocuments();

    // ==========================================
    // LOG
    // ==========================================

    if (isAlreadyIndexed) {
      console.log(
        "♻️ PDF already indexed"
      );

      console.log(
        "⚡ Existing vectors reused"
      );
    } else {
      console.log(
        "✅ PDF indexed using user's Gemini API key"
      );
    }

    console.log(
      "Document ID:",
      newDocumentId
    );

  } catch (error) {
    console.error(
      "Upload Error:",
      error.response?.data || error
    );

    setUploadError(
      error.response?.data?.message ||
        error.response?.data?.error ||
        "Failed to upload PDF."
    );

    setIndexStatus(
      "PDF indexing failed"
    );

  } finally {
    // Close SSE if still open
    if (eventSource) {
      eventSource.close();
    }

    setUploading(false);
  }
};

//connect api
const connectGeminiApi = async () => {
  if (!geminiApiKey.trim()) return;

  try {
    setValidatingKey(true);
    setApiKeyError("");

    const response = await axios.post(
      "http://localhost:5000/api/validate-key",
      {
        apiKey: geminiApiKey.trim(),
      }
    );

     if (response.data.success) {
  setApiKeyConnected(true);
  setApiKeyError("");

  sessionStorage.setItem(
    "gemini-api-key",
    geminiApiKey.trim()
  );

  sessionStorage.setItem(
    "gemini-api-connected",
    "true"
  );

  showToast(
    "Gemini API connected successfully.",
    "success"
  );

  console.log("✅ Gemini API connected");
}

  } catch (error) {
    console.error(
      "Gemini validation error:",
      error.response?.data || error
    );

    setApiKeyConnected(false);

    // Actual backend error UI me dikhega
    setApiKeyError(
      error.response?.data?.error ||
      error.response?.data?.message ||
      "Failed to validate Gemini API key."
    );

  } finally {
    setValidatingKey(false);
  }
};

//ask questions
  const askQuestion = async (e) => {
  e.preventDefault();

  const currentQuestion = question.trim();

  if (!currentQuestion || loading) return;

  if (!apiKeyConnected || !geminiApiKey.trim()) {
    setApiKeyError(
      "Please connect your Gemini API key first."
    );
    return;
  }

  if (!documentId) {
    alert("Please select or upload a PDF first.");
    return;
  }

  setMessages((prev) => [
    ...prev,
    {
      type: "user",
      text: currentQuestion,
    },
  ]);

  setQuestion("");
  setLoading(true);

  try {
    const response = await axios.post(
      "http://localhost:5000/api/query",
      {
        question: currentQuestion, // FIX
        documentId,
      },
      {
        headers: {
          "x-gemini-api-key": geminiApiKey.trim(),
        },
      }
    );

    const data = response.data;

    setMessages((prev) => [
      ...prev,
      {
        type: "assistant",
        text: data.answer,
        sources: data.sources || [],
      },
    ]);
  } catch (error) {
    console.error(
      "Query Error:",
      error.response?.data || error
    );

    setMessages((prev) => [
      ...prev,
      {
        type: "assistant",
        text:
          error.response?.data?.message ||
          error.response?.data?.error ||
          "Something went wrong while processing your question.",
        error: true,
      },
    ]);
  } finally {
    setLoading(false);
  }
};

return (
  <div className="app-layout">

    {deleteTarget && (
  <div
    className="modal-overlay"
    onClick={() => {
      if (!deleting) {
        setDeleteTarget(null);
      }
    }}
  >
    <div
      className="delete-modal"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="modal-close"
        disabled={deleting}
        onClick={() => setDeleteTarget(null)}
      >
        <X size={18} />
      </button>

      <div className="delete-modal-icon">
        <Trash2 size={24} />
      </div>

      <h3>Delete PDF?</h3>

      <p>
        Are you sure you want to delete
        <strong> {deleteTarget.originalName}</strong>?
      </p>

      <span className="delete-warning">
        This will permanently remove the PDF and its
        indexed data.
      </span>

      <div className="delete-modal-actions">
        <button
          type="button"
          className="cancel-delete-button"
          disabled={deleting}
          onClick={() => setDeleteTarget(null)}
        >
          Cancel
        </button>

        <button
          type="button"
          className="confirm-delete-button"
          disabled={deleting}
          onClick={confirmDeleteDocument}
        >
          {deleting ? (
            <>
              <LoaderCircle
                size={16}
                className="spinner"
              />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 size={16} />
              Delete PDF
            </>
          )}
        </button>
      </div>
    </div>
  </div>
)}


  {toast.show && (
  <div
    className={`app-toast ${
      toast.type === "error"
        ? "toast-error"
        : "toast-success"
    }`}
  >
    <div className="toast-icon">
      {toast.type === "error" ? (
        <AlertCircle size={19} />
      ) : (
        <CheckCircle2 size={19} />
      )}
    </div>

    <span>{toast.message}</span>

    <button
      type="button"
      onClick={() =>
        setToast((prev) => ({
          ...prev,
          show: false,
        }))
      }
    >
      <X size={16} />
    </button>
  </div>
)}

    <Sidebar
  documents={documents}
  documentsLoading={documentsLoading}
  documentId={documentId}
  selectDocument={selectDocument}
  deleteDocument={deleteDocument}

  selectedFile={selectedFile}
  setSelectedFile={setSelectedFile}
  uploadPdf={uploadPdf}
  uploading={uploading}
  uploadError={uploadError}

  indexProgress={indexProgress}
  indexStatus={indexStatus}
  indexedChunks={indexedChunks}

  apiKeyConnected={apiKeyConnected}
  geminiApiKey={geminiApiKey}
  setGeminiApiKey={setGeminiApiKey}

  showApiKey={showApiKey}
  setShowApiKey={setShowApiKey}

  connectGeminiApi={connectGeminiApi}
  validatingKey={validatingKey}
  apiKeyError={apiKeyError}

  disconnectGeminiApi={() => {
    sessionStorage.removeItem(
      "gemini-api-key"
    );

    sessionStorage.removeItem(
      "gemini-api-connected"
    );

    setGeminiApiKey("");
    setApiKeyConnected(false);
    setShowApiKey(false);
    setApiKeyError("");

    setDocumentId(null);
    setDocumentName("");
    setSelectedFile(null);

    // reset progress
    setIndexProgress(0);
    setIndexStatus("");
    setIndexedChunks({
      current: 0,
      total: 0,
    });

    setMessages([]);
    setQuestion("");

    showToast(
      "Gemini API disconnected.",
      "success"
    );
  }}
/>

    <div className="main-content">

      {documentId && (
  <div className="chat-toolbar">

    <div className="chat-document-info">
      <div className="chat-document-icon">
        <FileText size={19} />
      </div>

      <div>
        <strong>{documentName}</strong>
        <span>
          Ready for questions
        </span>
      </div>
    </div>

    {messages.length > 0 && (
      <button
        type="button"
        onClick={() => {
          setMessages([]);

          localStorage.removeItem(
            `pdf-chat-${documentId}`
          );
        }}
      >
        Clear Chat
      </button>
    )}

  </div>
)}

      <main className="chat-container">

        {messages.length === 0 && (
          <div className="welcome">

            <div className="welcome-icon">
              <Bot size={38} />
            </div>

           <h2>
  {uploading
    ? "Preparing your PDF..."
    : documentId
    ? `Ask questions about ${documentName}`
    : "Ask your PDF anything"}
</h2>

           <p>
  {uploading
    ? `Indexing your PDF... ${indexProgress}% completed`
    : documentId
    ? "Your PDF is ready. Ask questions and get AI-generated answers with relevant source references."
    : apiKeyConnected
    ? "Upload or select a PDF from the sidebar to start asking questions."
    : "Connect your Gemini API key from the sidebar to get started."}
</p>

            {documentId && !uploading && (
  <div className="suggestions">

                <button
                  onClick={() =>
                    setQuestion(
                      "Summarize this document"
                    )
                  }
                >
                  Summarize this document
                </button>

                <button
                  onClick={() =>
                    setQuestion(
                      "What are the key points?"
                    )
                  }
                >
                  What are the key points?
                </button>

                <button
                  onClick={() =>
                    setQuestion(
                      "Explain the main concepts in simple terms"
                    )
                  }
                >
                  Explain main concepts
                </button>

              </div>
            )}

          </div>
        )}

        <div className="messages">

          {messages.map((message, index) => (
            <div
              key={index}
              className={`message-row ${
                message.type === "user"
                  ? "user-row"
                  : "assistant-row"
              }`}
            >

              <div
                className={`avatar ${
                  message.type === "user"
                    ? "user-avatar"
                    : "bot-avatar"
                }`}
              >
                {message.type === "user" ? (
                  <User size={18} />
                ) : (
                  <Bot size={18} />
                )}
              </div>

              <div
                className={`message ${
                  message.type === "user"
                    ? "user-message"
                    : "assistant-message"
                } ${
                  message.error
                    ? "error-message"
                    : ""
                }`}
              >

                <div className="answer-text">
                  <ReactMarkdown>
                    {message.text}
                  </ReactMarkdown>
                </div>

                

                {message.sources?.length > 0 && (
  <div className="sources">

    <button
      type="button"
      className="sources-toggle"
      onClick={() =>
        setOpenSources((prev) => ({
          ...prev,
          [index]: !prev[index],
        }))
      }
    >
      <div>
        <BookOpen size={16} />

        <span>
          {message.sources.length} Sources
        </span>
      </div>

      <ChevronDown
        size={17}
        className={
          openSources[index]
            ? "sources-chevron open"
            : "sources-chevron"
        }
      />
    </button>

    {openSources[index] && (
      <div className="source-list">

        {message.sources.map(
          (source, sourceIndex) => (
            <div
              className="source-card"
              key={sourceIndex}
            >
              <div className="source-header">
                <span>Page {source.page}</span>

                <span>
                  {(source.score * 100).toFixed(1)}% match
                </span>
              </div>

              <p>{source.text}</p>
            </div>
          )
        )}

      </div>
    )}

  </div>
)}

              </div>

            </div>
          ))}

          {loading && (
            <div className="message-row assistant-row">

              <div className="avatar bot-avatar">
                <Bot size={18} />
              </div>

              <div className="message assistant-message loading-message">

                <LoaderCircle
                  className="spinner"
                  size={20}
                />

                Searching your PDF...

              </div>

            </div>
          )}

        </div>

      </main>

      <div className="input-section">

        <form
          className="input-wrapper"
          onSubmit={askQuestion}
        >

          {/* <input
            type="text"
            placeholder={
              !apiKeyConnected
                ? "Connect your Gemini API key first..."
                : documentId
                ? `Ask about ${documentName}...`
                : "Select or upload a PDF..."
            }
            value={question}
            onChange={(e) =>
              setQuestion(e.target.value)
            }
            disabled={
              loading ||
              !documentId ||
              !apiKeyConnected
            }
          /> */}

          <input
  value={question}
  onChange={(e) => setQuestion(e.target.value)}
  disabled={
    loading ||
    uploading ||
    !documentId ||
    !apiKeyConnected
  }
  placeholder={
    uploading
      ? `Indexing PDF... ${indexProgress}%`
      : !apiKeyConnected
      ? "Connect your Gemini API key first..."
      : documentId
      ? `Ask about ${documentName}...`
      : "Select or upload a PDF..."
  }
/>

          <button
            type="submit"
            className="send-button"
            disabled={
              !question.trim() ||
              loading ||
               uploading ||
              !documentId ||
              !apiKeyConnected
            }
          >

            {loading ? (
              <LoaderCircle
                className="spinner"
                size={20}
              />
            ) : (
              <Send size={20} />
            )}

          </button>

        </form>

        <p className="footer-text">
          Answers are generated from your indexed PDF using RAG.
        </p>

      </div>

    </div>
  </div>
);
}


export default App;