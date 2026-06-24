'use client';

import { useState, useEffect, useRef } from 'react';
import { Document } from '../../types';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: string[];
  responseTime?: number;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I am your enterprise AI assistant. Ask me anything from your assigned knowledge base.'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [hasDocuments, setHasDocuments] = useState(true);
  const [checkingDocs, setCheckingDocs] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedModel, setSelectedModel] = useState<'llama3.2:1b' | 'qwen3:14b'>('llama3.2:1b');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Check user documents on mount
  useEffect(() => {
    async function checkAssignedDocs() {
      try {
        const res = await fetch('/api/documents');
        if (res.ok) {
          const data = await res.json();
          const docs: Document[] = data.documents;
          setHasDocuments(docs.length > 0);
        } else {
          setErrorMsg('Failed to check assigned documents.');
        }
      } catch (err) {
        setErrorMsg('Network error validating documents.');
      } finally {
        setCheckingDocs(false);
      }
    }
    checkAssignedDocs();
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({ message: text, model: selectedModel })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: errData.error || 'Failed to send query. Verify server status.' }
        ]);
        setIsLoading(false);
        return;
      }

      // Add temporary empty bubble for streaming response
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Readable stream not supported.');
      }

      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const rawLine = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 2);

          const trimmedLine = rawLine.trim();
          if (trimmedLine.startsWith('data: ')) {
            // Find start of data payload without stripping spaces
            const dataIndex = rawLine.indexOf('data: ');
            const dataStr = rawLine.substring(dataIndex + 6);
            const trimmedDataStr = dataStr.trim();
            
            if (trimmedDataStr.startsWith('{') && trimmedDataStr.endsWith('}')) {
              try {
                const meta = JSON.parse(trimmedDataStr);
                if (meta.done) {
                  // Capture metadata and update last message
                  setMessages((prev) => {
                    const next = [...prev];
                    if (next.length > 0) {
                      next[next.length - 1] = {
                        role: 'assistant',
                        content: assistantContent,
                        sources: meta.sources,
                        responseTime: meta.responseTime
                      };
                    }
                    return next;
                  });
                  break;
                }
              } catch (e) {
                // Not JSON or parse failed, treat as raw text
                assistantContent += dataStr;
              }
            } else {
              let parsedContent = dataStr;
              if (trimmedDataStr.startsWith('"') && trimmedDataStr.endsWith('"')) {
                try {
                  parsedContent = JSON.parse(trimmedDataStr);
                } catch (e) {
                  // Fallback to raw text if parse fails
                }
              }
              assistantContent += parsedContent;
              setMessages((prev) => {
                const next = [...prev];
                if (next.length > 0) {
                  next[next.length - 1] = {
                    role: 'assistant',
                    content: assistantContent
                  };
                }
                return next;
              });
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: 'Connection timed out or network offline.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage(inputValue);
    }
  };

  // Plain formatting helpers
  const renderLineWithBold = (text: string) => {
    const parts = text.split('**');
    return parts.map((part, index) => {
      // Every odd index is inside double asterisks (bold)
      if (index % 2 === 1) {
        return <strong key={index} style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{part}</strong>;
      }
      return part;
    });
  };

  const renderMessageText = (content: string) => {
    const lines = content.split('\n');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          
          // Check if it is a list bullet (starts with '* ' or '- ' - note the space)
          if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            const listContent = trimmed.substring(2).trim();
            return (
              <li key={idx} style={{ marginLeft: '16px', listStyleType: 'disc', color: 'var(--text-secondary)' }}>
                {renderLineWithBold(listContent)}
              </li>
            );
          }
          
          // Check if it is a numbered list (e.g. '1. ')
          if (/^\d+\.\s/.test(trimmed)) {
            const numContent = trimmed.replace(/^\d+\.\s/, '').trim();
            const match = trimmed.match(/^(\d+\.)/);
            const prefix = match ? match[1] + ' ' : '';
            return (
              <div key={idx} style={{ marginLeft: '16px', color: 'var(--text-secondary)' }}>
                <strong>{prefix}</strong>{renderLineWithBold(numContent)}
              </div>
            );
          }
          
          if (trimmed === '') return <div key={idx} style={{ height: '8px' }}></div>;
          
          return <p key={idx} style={{ margin: 0 }}>{renderLineWithBold(line)}</p>;
        })}
      </div>
    );
  };

  if (checkingDocs) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0', color: 'var(--text-secondary)' }}>
        <div className="typing-indicator">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, position: 'relative' }}>
      {/* Title & Model Selector Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px' 
      }}>
        <div>
          <h1 className="dashboard-title" style={{ fontSize: '2.2rem', fontWeight: '800', textAlign: 'left', marginBottom: '8px' }}>
            AI Chat Assistant
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Secure retrieval scoping verification active. System prompt enforced.</p>
        </div>

        {/* Model Selection Control */}
        <div style={{ 
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '4px',
          backdropFilter: 'blur(8px)',
          gap: '4px'
        }}>
          <button
            onClick={() => setSelectedModel('llama3.2:1b')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '8px',
              background: selectedModel === 'llama3.2:1b' ? 'var(--primary)' : 'transparent',
              color: selectedModel === 'llama3.2:1b' ? 'white' : 'var(--text-secondary)',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: selectedModel === 'llama3.2:1b' ? '0 4px 12px rgba(99, 102, 241, 0.25)' : 'none',
            }}
          >
            ⚡ Fast (1B Llama)
          </button>
          <button
            onClick={() => setSelectedModel('qwen3:14b')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '8px',
              background: selectedModel === 'qwen3:14b' ? 'var(--primary)' : 'transparent',
              color: selectedModel === 'qwen3:14b' ? 'white' : 'var(--text-secondary)',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: selectedModel === 'qwen3:14b' ? '0 4px 12px rgba(99, 102, 241, 0.25)' : 'none',
            }}
          >
            🧠 Powerful (12B/14B Qwen)
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="glass-card" style={{ padding: '14px 20px', borderLeft: '4px solid #EF4444', color: '#EF4444', background: 'rgba(239, 68, 68, 0.1)', marginBottom: '20px' }}>
          {errorMsg}
        </div>
      )}

      {/* Access Restriction Banner */}
      {!hasDocuments && (
        <div className="glass-card" style={{
          padding: '24px',
          borderLeft: '4px solid #EF4444',
          background: 'rgba(239, 68, 68, 0.08)',
          color: '#F87171',
          marginBottom: '20px',
          borderRadius: '12px'
        }}>
          ⚠️ <strong>You have no documents assigned.</strong> Contact your administrator to assign knowledge base documents to your account.
        </div>
      )}

      {/* Chat Messages Panel */}
      <div className="glass-card" style={{
        flex: 1,
        maxHeight: 'calc(100vh - 280px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '24px',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        marginBottom: '20px'
      }}>
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const isSystem = msg.role === 'system';
          
          let bubbleBg = 'var(--chat-msg-bot)';
          let alignSelf = 'flex-start';
          let border = '1px solid var(--border-color)';
          let textColor = 'var(--text-primary)';

          if (isUser) {
            bubbleBg = 'var(--chat-msg-user)';
            alignSelf = 'flex-end';
            border = 'none';
            textColor = 'white';
          } else if (isSystem) {
            bubbleBg = 'rgba(239, 68, 68, 0.08)';
            alignSelf = 'center';
            border = '1px solid rgba(239, 68, 68, 0.2)';
            textColor = '#F87171';
          }

          return (
            <div
              key={index}
              style={{
                alignSelf: alignSelf as any,
                maxWidth: isSystem ? '95%' : '75%',
                background: bubbleBg,
                border,
                borderRadius: '16px',
                padding: '14px 18px',
                fontSize: '0.92rem',
                lineHeight: '1.6',
                color: textColor,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: isUser ? '0 4px 12px rgba(99, 102, 241, 0.15)' : 'none',
                animation: 'fadeInUp 0.3s ease-out'
              }}
            >
              {isSystem ? (
                <div><strong>System Alert: </strong>{msg.content}</div>
              ) : (
                renderMessageText(msg.content)
              )}

              {/* Source lists and Response metrics */}
              {!isUser && !isSystem && msg.sources && msg.sources.length > 0 && (
                <div style={{
                  marginTop: '6px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)'
                }}>
                  <span>Sources:</span>
                  {msg.sources.map((s, idx) => (
                    <span key={idx} style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      color: 'var(--secondary)'
                    }}>
                      {s}
                    </span>
                  ))}
                  {msg.responseTime !== undefined && (
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                      Generated in {(msg.responseTime / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        
        {isLoading && (
          <div style={{
            alignSelf: 'flex-start',
            background: 'var(--chat-msg-bot)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '12px 18px',
            width: '64px'
          }}>
            <div className="typing-indicator" style={{ display: 'flex', gap: '4px' }}>
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input container */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <input
          type="text"
          className="chat-input"
          placeholder={hasDocuments ? "Ask anything from your assigned knowledge base..." : "No documents assigned."}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={isLoading || !hasDocuments}
          style={{
            flex: 1,
            padding: '16px 20px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            color: 'white',
            outline: 'none',
            fontSize: '0.95rem',
            fontFamily: 'var(--font-sans)',
            transition: 'border-color 0.2s'
          }}
        />
        <button
          onClick={() => handleSendMessage(inputValue)}
          disabled={!inputValue.trim() || isLoading || !hasDocuments}
          style={{
            padding: '0 24px',
            background: 'var(--primary)',
            border: 'none',
            borderRadius: '14px',
            color: 'white',
            fontWeight: '600',
            cursor: (!inputValue.trim() || isLoading || !hasDocuments) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
        >
          Send ➔
        </button>
      </div>
    </div>
  );
}
