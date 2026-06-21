import {
  Bot,
  Check,
  Copy,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import * as XLSX from "xlsx";
import { useAuth } from '../../contexts/AuthContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const SUGGESTIONS = [
  { icon: "❓", text: "Why did my import fail?" },
  { icon: "📊", text: "How do I format my Excel file?" },
  { icon: "🔍", text: "Generate a SQL query" },
  { icon: "📋", text: "What tables are available?" },
];

const getFileIcon = (filename: string) => {
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return { icon: "📄", color: "#ef4444", label: "PDF" };
  if (ext && ["xlsx", "xls"].includes(ext))
    return { icon: "📊", color: "#22c55e", label: "Excel" };
  if (ext === "csv") return { icon: "📋", color: "#3b82f6", label: "CSV" };
  if (ext && ["png", "jpg", "jpeg", "webp"].includes(ext))
    return { icon: "🖼️", color: "#f59e0b", label: "Image" };
  return { icon: "📎", color: "#a5b4fc", label: "File" };
};

const readFileContent = async (file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
    return new Promise<any>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) =>
        resolve({
          type: "image",
          content: e.target?.result,
          mimeType: file.type,
        });
      reader.readAsDataURL(file);
    });
  }

  if (ext === "pdf") {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += `\n[Page ${i}]\n${content.items.map((item: any) => item.str).join(" ")}`;
    }
    return { type: "pdf", content: fullText, pages: pdf.numPages };
  }

  if (["xlsx", "xls"].includes(ext)) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    let fullText = "";
    workbook.SheetNames.forEach((sheetName) => {
      fullText += `\n[Sheet: ${sheetName}]\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}`;
    });
    const json = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      { header: 1 },
    ) as any[][];
    return {
      type: "excel",
      content: fullText,
      headers: json[0] || [],
      rowCount: json.length - 1,
      sheets: workbook.SheetNames,
    };
  }

  return new Promise<any>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({ type: "text", content: e.target?.result });
    reader.readAsText(file);
  });
};

const buildFilePrompt = (
  userMessage: string,
  filename: string,
  fileData: any,
) => {
  const base = userMessage || "Analyze this file and identify any issues";
  if (fileData.type === "pdf") {
    return `${base}\n\n📄 PDF File: ${filename} (${fileData.pages} pages)\n\nExtracted content:\n\`\`\`\n${fileData.content}\n\`\`\`\n\nAnalyze this document and answer the user's question.`;
  }
  if (fileData.type === "excel") {
    return `${base}\n\n📊 Excel File: ${filename}\n- Sheets: ${fileData.sheets.join(", ")}\n- Detected columns: ${fileData.headers.join(", ")}\n- Number of rows: ${fileData.rowCount}\n\nData (CSV):\n\`\`\`\n${fileData.content}\n\`\`\`\n\nAnalyze this Excel file, identify any format issues, and compare with known Snowflake tables.`;
  }
  return `${base}\n\n📋 File: ${filename}\n\`\`\`\n${fileData.content}\n\`\`\``;
};

// ── Message bubble ────────────────────────────────────────────────
const MessageBubble = ({ msg }: { msg: any }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
        alignItems: "flex-start",
        gap: "12px",
      }}
    >
      {msg.sender === "bot" && (
        <div
          style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            borderRadius: "50%",
            width: "32px",
            height: "32px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "2px",
            boxShadow: "0 2px 8px rgba(99,102,241,0.4)",
          }}
        >
          <Bot size={15} color="white" />
        </div>
      )}

      <div
        style={{
          maxWidth: msg.sender === "user" ? "65%" : "80%",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: msg.sender === "user" ? "flex-end" : "flex-start",
        }}
      >
        <div
          style={{
            padding: msg.sender === "user" ? "12px 16px" : "16px 20px",
            borderRadius:
              msg.sender === "user"
                ? "18px 18px 4px 18px"
                : "4px 18px 18px 18px",
            background:
              msg.sender === "user"
                ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                : "transparent",
            color: "white",
            fontSize: "14px",
            textAlign: "left",
            lineHeight: "1.8",
            boxShadow:
              msg.sender === "user"
                ? "0 4px 15px rgba(99,102,241,0.3)"
                : "none",
          }}
        >
          {msg.sender === "bot" ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p
                    style={{
                      margin: "0 0 12px 0",
                      color: "#e2e8f0",
                      lineHeight: "1.8",
                    }}
                  >
                    {children}
                  </p>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: "#ffffff", fontWeight: "600" }}>
                    {children}
                  </strong>
                ),
                em: ({ children }) => (
                  <em style={{ color: "#c4b5fd" }}>{children}</em>
                ),
                ul: ({ children }) => (
                  <ul
                    style={{
                      paddingLeft: "0",
                      margin: "8px 0 12px 0",
                      listStyle: "none",
                    }}
                  >
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol
                    style={{
                      paddingLeft: "0",
                      margin: "8px 0 12px 0",
                      listStyle: "none",
                    }}
                  >
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      marginBottom: "8px",
                      color: "#e2e8f0",
                      lineHeight: "1.7",
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#6366f1",
                        flexShrink: 0,
                        marginTop: "8px",
                      }}
                    />
                    <span>{children}</span>
                  </li>
                ),
                code: ({ children, ...props }: any) => {
                  const isInline = !props.node?.position;
                  return isInline ? (
                    <code
                      style={{
                        background: "rgba(99,102,241,0.15)",
                        border: "1px solid rgba(99,102,241,0.3)",
                        borderRadius: "5px",
                        padding: "2px 7px",
                        fontSize: "13px",
                        color: "#a5b4fc",
                        fontFamily: "monospace",
                      }}
                    >
                      {children}
                    </code>
                  ) : (
                    <code
                      style={{
                        fontFamily: "monospace",
                        fontSize: "13px",
                        color: "#e2e8f0",
                      }}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <div style={{ margin: "12px 0" }}>
                    <div
                      style={{
                        background: "#0d0d1a",
                        border: "1px solid #2a2a3e",
                        borderRadius: "12px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          background: "#1a1a2e",
                          padding: "8px 16px",
                          borderBottom: "1px solid #2a2a3e",
                        }}
                      >
                        <span style={{ color: "#6c7086", fontSize: "12px" }}>
                          code
                        </span>
                      </div>
                      <pre
                        style={{
                          padding: "16px",
                          overflowX: "auto",
                          fontSize: "13px",
                          margin: "0",
                          fontFamily: "monospace",
                          lineHeight: "1.6",
                          color: "#e2e8f0",
                        }}
                      >
                        {children}
                      </pre>
                    </div>
                  </div>
                ),
                h1: ({ children }) => (
                  <h1
                    style={{
                      color: "#ffffff",
                      margin: "16px 0 8px",
                      fontSize: "20px",
                      fontWeight: "700",
                      borderBottom: "1px solid #2a2a3e",
                      paddingBottom: "8px",
                    }}
                  >
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2
                    style={{
                      color: "#ffffff",
                      margin: "14px 0 8px",
                      fontSize: "17px",
                      fontWeight: "600",
                    }}
                  >
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3
                    style={{
                      color: "#a5b4fc",
                      margin: "12px 0 6px",
                      fontSize: "15px",
                      fontWeight: "600",
                    }}
                  >
                    {children}
                  </h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    style={{
                      borderLeft: "3px solid #6366f1",
                      paddingLeft: "14px",
                      margin: "10px 0",
                      color: "#94a3b8",
                      fontStyle: "italic",
                    }}
                  >
                    {children}
                  </blockquote>
                ),
                hr: () => (
                  <hr
                    style={{
                      border: "none",
                      borderTop: "1px solid #2a2a3e",
                      margin: "14px 0",
                    }}
                  />
                ),
                table: ({ children }) => (
                  <div
                    style={{
                      overflowX: "auto",
                      margin: "12px 0",
                      borderRadius: "10px",
                      border: "1px solid #2a2a3e",
                    }}
                  >
                    <table
                      style={{
                        borderCollapse: "collapse",
                        width: "100%",
                        fontSize: "13px",
                      }}
                    >
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th
                    style={{
                      background: "#1a1a2e",
                      padding: "10px 14px",
                      textAlign: "left",
                      color: "#a5b4fc",
                      borderBottom: "1px solid #2a2a3e",
                      fontWeight: "600",
                    }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td
                    style={{
                      padding: "9px 14px",
                      borderBottom: "1px solid #1a1a2e",
                      color: "#e2e8f0",
                    }}
                  >
                    {children}
                  </td>
                ),
              }}
            >
              {msg.text}
            </ReactMarkdown>
          ) : (
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            paddingInline: "4px",
          }}
        >
          <span style={{ color: "#3a3a5a", fontSize: "11px" }}>{time}</span>
          {msg.sender === "bot" && (
            <button
              onClick={handleCopy}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: copied ? "#22c55e" : "#3a3a5a",
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "11px",
                padding: "0",
                transition: "color 0.2s",
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>

      {msg.sender === "user" && (
        <div
          style={{
            background: "#8b5cf6",
            borderRadius: "50%",
            width: "32px",
            height: "32px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "2px",
          }}
        >
          <User size={15} color="white" />
        </div>
      )}
    </div>
  );
};

// ── Upload Zone ───────────────────────────────────────────────────
const UploadZone = ({ onFile }: { onFile: (file: File) => void }) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? "#6366f1" : "#2a2a3e"}`,
        borderRadius: "14px",
        padding: "28px 20px",
        textAlign: "center",
        cursor: "pointer",
        background: dragging
          ? "rgba(99,102,241,0.08)"
          : "rgba(255,255,255,0.02)",
        transition: "all 0.2s",
        marginBottom: "16px",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt,.log,.pdf,.png,.jpg,.jpeg,.webp"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
        }}
      />
      <div style={{ fontSize: "28px", marginBottom: "8px" }}>📂</div>
      <div
        style={{
          color: "#a5b4fc",
          fontWeight: "600",
          fontSize: "14px",
          marginBottom: "4px",
        }}
      >
        Drop your file here or click to browse
      </div>
      <div style={{ color: "#4a4a6a", fontSize: "12px" }}>
        PDF · Excel · CSV · TXT · PNG · JPG · WEBP
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────
const AIChatbotBubble = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([
    {
      id: 1,
      text: "Hello! I'm your AI assistant for Snowflake Loader. How can I help you?",
      sender: "bot",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, isOpen]);

  const clearConversation = () => {
    setMessages([
      {
        id: 1,
        text: "Hello! I'm your AI assistant for Snowflake Loader. How can I help you?",
        sender: "bot",
        timestamp: Date.now(),
      },
    ]);
    setShowSuggestions(true);
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() && !attachedFile) return;

    setShowSuggestions(false);
    setShowUploadZone(false);

    let fullPrompt = messageText;
    let displayText = messageText;
    let imageData: any = null;

    if (attachedFile) {
      setFileLoading(true);
      try {
        const fileData = await readFileContent(attachedFile);
        const fileInfo = getFileIcon(attachedFile.name);
        if (fileData.type === "image") {
          imageData = {
            base64: fileData.content,
            userMessage:
              messageText || "Analyze this screenshot and explain what you see",
          };
          displayText = `${messageText || "Analyze this screenshot"} 🖼️ ${attachedFile.name}`;
          fullPrompt =
            messageText || "Analyze this screenshot and explain what you see";
        } else {
          fullPrompt = buildFilePrompt(
            messageText,
            attachedFile.name,
            fileData,
          );
          displayText = `${messageText || "Analyze this file"} ${fileInfo.icon} ${attachedFile.name}`;
        }
      } catch (err) {
        fullPrompt = `${messageText}\n\n📎 Attached file: ${attachedFile.name} (could not be read)`;
        displayText = `${messageText} 📎 ${attachedFile.name}`;
      } finally {
        setFileLoading(false);
      }
    }

    const userMsg = {
      id: Date.now(),
      text: displayText,
      sender: "user",
      timestamp: Date.now(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsTyping(true);

    try {
      const history = newMessages
        .filter((m) => m.id !== 1)
        .map((m, idx, arr) => {
          const isLast = idx === arr.length - 1 && m.sender === "user";
          return {
            role: m.sender === "user" ? "user" : "assistant",
            content: isLast && !imageData ? fullPrompt : String(m.text),
          };
        });

      // ← URL CORRECTE — appelle le backend de l'équipe
      const res = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          
            messages: history,
  image: imageData ? imageData.base64 : null,
  role: user?.role || "user",
  user_id: user?.id ? Number(user.id) : null,
  user_email: user?.email || null,
  user_name: user?.name || null,
        }),
      });

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
         text: data.escalated
  ? data.response + "\n\n📧 L'administrateur a été notifié et vous contactera bientôt."
  : data.response,
          sender: "bot",
          timestamp: Date.now(),
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: "❌ Connection error. Make sure the backend is running on port 8000.",
          sender: "bot",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const fileInfo = attachedFile ? getFileIcon(attachedFile.name) : null;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: isOpen
            ? "#1e293b"
            : "linear-gradient(135deg, #6366f1, #8b5cf6)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
          zIndex: 1000,
          transition: "all 0.3s",
        }}
      >
        {isOpen ? (
          <X size={22} color="white" />
        ) : (
          <MessageSquare size={22} color="white" />
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "96px",
            right: "24px",
            width: "420px",
            height: "600px",
            background: "#0d0d1a",
            border: "1px solid #2a2a3e",
            borderRadius: "20px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid #2a2a3e",
              background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 15px rgba(99,102,241,0.4)",
                }}
              >
                <Bot size={18} color="white" />
              </div>
              <div>
                <div
                  style={{
                    color: "white",
                    fontWeight: "700",
                    fontSize: "14px",
                  }}
                >
                  SnowBot AI
                </div>
                <div
                  style={{
                    color: "#4a4a6a",
                    fontSize: "11px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#22c55e",
                      display: "inline-block",
                    }}
                  />
                  Online
                </div>
              </div>
            </div>
            <button
              onClick={clearConversation}
              style={{
                background: "#1e1e2e",
                border: "1px solid #2a2a3e",
                borderRadius: "10px",
                padding: "6px 12px",
                color: "#6c7086",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                transition: "all 0.2s",
              }}
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {/* Suggestions */}
            {showSuggestions && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  marginTop: "4px",
                }}
              >
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s.text)}
                    style={{
                      background: "#1a1a2e",
                      border: "1px solid #2a2a3e",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      color: "white",
                      fontSize: "12px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "#6366f1";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "#2a2a3e";
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>{s.icon}</span>
                    <span
                      style={{
                        color: "#94a3b8",
                        fontSize: "11px",
                        lineHeight: "1.4",
                      }}
                    >
                      {s.text}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* File loading */}
            {fileLoading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "#6366f1",
                  fontSize: "13px",
                }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "2px solid #6366f1",
                    borderTopColor: "transparent",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                Reading file...
              </div>
            )}

            {/* Typing */}
            {isTyping && (
              <div
                style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}
              >
                <div
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    borderRadius: "50%",
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bot size={14} color="white" />
                </div>
                <div
                  style={{
                    background: "#1e1e2e",
                    border: "1px solid #2a2a3e",
                    borderRadius: "4px 18px 18px 18px",
                    padding: "12px 16px",
                    display: "flex",
                    gap: "4px",
                    alignItems: "center",
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#6366f1",
                        animation: "bounce 1.2s infinite",
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Upload Zone */}
          {showUploadZone && (
            <div style={{ padding: "0 16px" }}>
              <UploadZone
                onFile={(file) => {
                  setAttachedFile(file);
                  setShowUploadZone(false);
                }}
              />
            </div>
          )}

          {/* Input */}
          <div
            style={{
              borderTop: "1px solid #2a2a3e",
              background: "#0d0d1a",
              padding: "12px 16px",
            }}
          >
            {attachedFile && fileInfo && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#1a1a2e",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  marginBottom: "8px",
                  width: "fit-content",
                  border: `1px solid ${fileInfo.color}44`,
                }}
              >
                <span style={{ fontSize: "16px" }}>{fileInfo.icon}</span>
                <div>
                  <div
                    style={{
                      color: "white",
                      fontSize: "12px",
                      fontWeight: "500",
                    }}
                  >
                    {attachedFile.name}
                  </div>
                  <div style={{ color: fileInfo.color, fontSize: "10px" }}>
                    {fileInfo.label} · {(attachedFile.size / 1024).toFixed(1)}{" "}
                    KB
                  </div>
                </div>
                <button
                  onClick={() => setAttachedFile(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    marginLeft: "4px",
                  }}
                >
                  <X size={12} color="#6c7086" />
                </button>
              </div>
            )}

            <div
              style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}
            >
              <button
                onClick={() => setShowUploadZone((v) => !v)}
                style={{
                  background:
                    showUploadZone || attachedFile
                      ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                      : "#1a1a2e",
                  border: `1px solid ${showUploadZone || attachedFile ? "#6366f1" : "#2a2a3e"}`,
                  borderRadius: "12px",
                  width: "40px",
                  height: "40px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Paperclip size={16} color="white" />
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask a question or attach a file..."
                rows={1}
                style={{
                  flex: 1,
                  background: "#1a1a2e",
                  border: "1px solid #2a2a3e",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  color: "white",
                  fontSize: "13px",
                  outline: "none",
                  resize: "none",
                  lineHeight: "1.5",
                  fontFamily: "inherit",
                  maxHeight: "100px",
                  overflowY: "auto",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#6366f1")}
                onBlur={(e) => (e.target.style.borderColor = "#2a2a3e")}
              />

              <button
                onClick={() => sendMessage()}
                disabled={isTyping || fileLoading}
                style={{
                  background:
                    isTyping || fileLoading
                      ? "#1a1a2e"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  border: "none",
                  borderRadius: "12px",
                  width: "40px",
                  height: "40px",
                  cursor: isTyping || fileLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow:
                    isTyping || fileLoading
                      ? "none"
                      : "0 4px 15px rgba(99,102,241,0.4)",
                }}
              >
                <Send
                  size={16}
                  color={isTyping || fileLoading ? "#4a4a6a" : "white"}
                />
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: "4px",
                marginTop: "8px",
                flexWrap: "wrap",
              }}
            >
              {["📄 PDF", "📊 Excel", "📋 CSV", "🖼️ Image"].map((f) => (
                <span
                  key={f}
                  style={{
                    fontSize: "10px",
                    color: "#3a3a5a",
                    background: "#1a1a2e",
                    borderRadius: "6px",
                    padding: "2px 6px",
                    border: "1px solid #2a2a3e",
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea::placeholder { color: #3a3a5a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 3px; }
      `}</style>
    </>
  );
};

export default AIChatbotBubble;
