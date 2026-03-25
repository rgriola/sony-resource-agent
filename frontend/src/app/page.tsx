"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import DocumentSidebar from "@/components/DocumentSidebar";
import MessageList from "@/components/MessageList";
import ChatInput from "@/components/ChatInput";
import SuggestedQuestions from "@/components/SuggestedQuestions";
import UploadModal from "@/components/UploadModal";
import SettingsDrawer from "@/components/SettingsDrawer";
import { useChat } from "@/hooks/useChat";

const PDFViewerPanel = dynamic(() => import("@/components/PDFViewerPanel"), {
  ssr: false,
});

export default function Home() {
  const { messages, isLoading, sendMessage, clearMessages } = useChat();
  const [selectedDocument, setSelectedDocument] = useState<string | undefined>();
  const [showUpload, setShowUpload] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pdfViewer, setPdfViewer] = useState<{ file: string; page: number } | null>(null);

  const handleSend = (question: string) => {
    sendMessage(question, selectedDocument);
  };

  const handleCitationClick = useCallback((sourceFile: string, page: number) => {
    setPdfViewer({ file: sourceFile, page });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header onSettingsClick={() => setShowSettings(true)} />

      <div className="flex flex-1 overflow-hidden">
        <DocumentSidebar
          selectedDocument={selectedDocument}
          onSelectDocument={setSelectedDocument}
          onUploadClick={() => setShowUpload(true)}
          refreshKey={refreshKey}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />

        <div className="flex flex-1 flex-col">
          <MessageList messages={messages} onCitationClick={handleCitationClick} />
          {messages.length === 0 && (
            <SuggestedQuestions onSelect={handleSend} />
          )}
          <ChatInput onSend={handleSend} isLoading={isLoading} />
        </div>

        {pdfViewer && (
          <PDFViewerPanel
            filename={pdfViewer.file}
            page={pdfViewer.page}
            onClose={() => setPdfViewer(null)}
            onPageChange={(page) => setPdfViewer((prev) => prev ? { ...prev, page } : null)}
          />
        )}
      </div>

      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={() => setRefreshKey((k) => k + 1)}
      />
      <SettingsDrawer
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
