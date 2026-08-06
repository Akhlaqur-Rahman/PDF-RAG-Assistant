import {
  FileText,
  Plus,
  Trash2,
  KeyRound,
  ShieldCheck,
  LogOut,
  Eye,
  EyeOff,
  Upload,
   X,
  LoaderCircle,
} from "lucide-react";
import "./Sidebar.css";

function Sidebar({
  documents,
  documentsLoading,
  documentId,
  selectDocument,
  deleteDocument,

  selectedFile,
  setSelectedFile,
  uploadPdf,
  uploading,
  uploadError,

 indexProgress = 0,
indexStatus = "Preparing PDF...",
indexedChunks = {
  current: 0,
  total: 0,
},

  apiKeyConnected,
  geminiApiKey,
  setGeminiApiKey,
  showApiKey,
  setShowApiKey,
  connectGeminiApi,
  validatingKey,
  apiKeyError,
  disconnectGeminiApi,
}) {
  const formatFileSize = (bytes) => {
    if (!bytes) return "0 MB";

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <aside className="sidebar">

      {/* ========================= */}
      {/* BRAND */}
      {/* ========================= */}

      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <FileText size={23} />
        </div>

        <div>
          <h2>Ask Your PDF</h2>
          <p>AI-powered PDF Assistant</p>
        </div>
      </div>


      {/* ========================= */}
{/* UPLOAD */}
{/* ========================= */}

<div className="sidebar-upload">

  <label
    className={`sidebar-upload-button ${
      !apiKeyConnected || uploading
        ? "disabled"
        : ""
    }`}
  >
    <Plus size={18} />

    <span>Choose PDF</span>

    <input
      type="file"
      accept="application/pdf"
      hidden
        disabled={!apiKeyConnected || uploading}
      onChange={(e) => {
        const file = e.target.files?.[0];

        if (file) {
          setSelectedFile(file);
        }

        e.target.value = "";
      }}
    />
  </label>

  {!apiKeyConnected && (
    <div className="sidebar-api-notice">
      <KeyRound size={15} />

      <span>
        Connect Gemini API to upload and ask questions
      </span>
    </div>
  )}

  {selectedFile && (
    <div className="selected-upload-card">

      <div className="selected-upload-file">
        <div className="selected-upload-icon">
          <FileText size={18} />
        </div>

        <div className="selected-upload-info">
          <strong title={selectedFile.name}>
            {selectedFile.name}
          </strong>

          <span>
            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
          </span>
        </div>

        {!uploading && (
          <button
            type="button"
            className="remove-selected-file"
            onClick={() => setSelectedFile(null)}
            title="Remove file"
          >
            <X size={15} />
          </button>
        )}
      </div>



     <button
  type="button"
  className="index-pdf-button"
  onClick={uploadPdf}
  disabled={uploading}
>
  {uploading ? (
    <>
      <LoaderCircle
        size={16}
        className="spinner"
      />

      Indexing PDF...
    </>
  ) : (
    <>
      <Upload size={16} />
      Upload & Index
    </>
  )}
</button>

{/* INDEXING PROGRESS */}
{uploading && (
  <div className="index-progress-container">

    <div className="index-progress-info">
      <span>
        {indexStatus || "Preparing PDF..."}
      </span>

      <strong>
  {indexProgress ?? 0}%
</strong>
    </div>

    <div className="index-progress-track">
      <div
        className="index-progress-bar"
        style={{
  width: `${indexProgress ?? 0}%`,
}}
      />
    </div>

   {indexedChunks?.total > 0 && (
  <div className="index-chunk-status">
    {indexedChunks?.current ?? 0} /{" "}
    {indexedChunks?.total ?? 0} chunks indexed
  </div>
)}

  </div>
)}


    </div>
  )}

  {uploadError && (
    <div className="sidebar-upload-error">
      {uploadError}
    </div>
  )}

</div>


      {/* ========================= */}
      {/* DOCUMENTS */}
      {/* ========================= */}

      <div className="sidebar-documents">

        <div className="sidebar-section-title">
          <span>Your Documents</span>

          <span className="sidebar-count">
            {documents.length}
          </span>
        </div>


        <div className="sidebar-document-list">

          {documentsLoading ? (

            <div className="sidebar-loading">
              <LoaderCircle
                size={18}
                className="spinner"
              />

              <span>Loading PDFs...</span>
            </div>

          ) : documents.length === 0 ? (

            <div className="sidebar-empty">
              <FileText size={28} />
              <span>No PDFs uploaded yet.</span>
            </div>

          ) : (

            documents.map((doc) => {

              const selected =
                documentId === doc.documentId;

              return (
                <div
                  key={doc.documentId}
                  className={`sidebar-document ${
                    selected ? "active" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    selectDocument(doc)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      selectDocument(doc);
                    }
                  }}
                >

                  <div className="sidebar-document-icon">
                    <FileText size={18} />
                  </div>


                  <div className="sidebar-document-info">

                    <strong title={doc.originalName}>
                      {doc.originalName}
                    </strong>

                    <span>
                      {formatFileSize(doc.size)}
                    </span>

                  </div>


                  {selected && (
                    <span
                      className="selected-dot"
                      title="Selected"
                    />
                  )}


                  <button
                    type="button"
                    className="sidebar-delete"
                    title="Delete PDF"
                    onClick={(event) =>
                      deleteDocument(doc, event)
                    }
                  >
                    <Trash2 size={16} />
                  </button>

                </div>
              );
            })

          )}

        </div>

      </div>


      {/* ========================= */}
      {/* API CONNECTION */}
      {/* ========================= */}

      <div className="sidebar-api">

        <div className="sidebar-api-title">
          AI CONNECTION
        </div>


        {!apiKeyConnected ? (
          <>

            <div className="sidebar-api-input">

              <KeyRound size={17} />

              <input
                type={
                  showApiKey
                    ? "text"
                    : "password"
                }
                value={geminiApiKey}
                placeholder="Gemini API key"
                disabled={validatingKey}
                autoComplete="off"
                onChange={(e) =>
                  setGeminiApiKey(
                    e.target.value
                  )
                }
              />

              <button
                type="button"
                onClick={() =>
                  setShowApiKey(
                    (prev) => !prev
                  )
                }
              >
                {showApiKey ? (
                  <EyeOff size={16} />
                ) : (
                  <Eye size={16} />
                )}
              </button>

            </div>


            <button
              type="button"
              className="sidebar-connect-button"
              disabled={
                !geminiApiKey.trim() ||
                validatingKey
              }
              onClick={connectGeminiApi}
            >

              {validatingKey ? (
                <>
                  <LoaderCircle
                    size={16}
                    className="spinner"
                  />

                  Connecting...
                </>
              ) : (
                <>
                  <KeyRound size={16} />
                  Connect Gemini
                </>
              )}

            </button>


            {apiKeyError && (
              <p className="sidebar-error">
                {apiKeyError}
              </p>
            )}

          </>
        ) : (

          <div className="sidebar-api-status">

            <div className="sidebar-api-icon connected">
              <ShieldCheck size={18} />
            </div>


            <div className="sidebar-api-info">

              <strong>
                Gemini API
              </strong>

              <span className="sidebar-api-connected">
                ● Connected
              </span>

            </div>


            <button
              type="button"
              className="api-disconnect-icon"
              title="Disconnect"
              onClick={disconnectGeminiApi}
            >
              <LogOut size={16} />
            </button>

          </div>

        )}


        <p className="api-security-text">
          Your API key is used only for AI requests.
        </p>

      </div>

    </aside>
  );
}

export default Sidebar;