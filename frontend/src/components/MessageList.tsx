"use client";

import { useEffect, useRef } from "react";
import { Message } from "@/hooks/useChat";
import { Source } from "@/lib/api";
import { User, Bot, FileText } from "lucide-react";

interface MessageListProps {
  messages: Message[];
  onCitationClick?: (sourceFile: string, page: number) => void;
}

function CitationBadge({
  source,
  onClick,
}: {
  source: Source;
  onClick?: (sourceFile: string, page: number) => void;
}) {
  return (
    <button
      onClick={() => onClick?.(source.source_file, source.page)}
      className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
      title={`${source.source_file} — Page ${source.page} (click to view)`}
    >
      <FileText className="h-3 w-3" />
      p.{source.page}
    </button>
  );
}

function AssistantMessage({
  message,
  onCitationClick,
}: {
  message: Message;
  onCitationClick?: (sourceFile: string, page: number) => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
        <Bot className="h-4 w-4 text-blue-700 dark:text-blue-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
          {message.content || (
            <span className="text-zinc-400">Thinking...</span>
          )}
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* Deduplicate by page */}
            {[
              ...new Map(
                message.sources.map((s) => [s.page, s]),
              ).values(),
            ].map((source) => (
              <CitationBadge
                key={`${source.source_file}-${source.page}`}
                source={source}
                onClick={onCitationClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
        <User className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-900 dark:text-zinc-100">
          {message.content}
        </p>
      </div>
    </div>
  );
}

export default function MessageList({
  messages,
  onCitationClick,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950">
          <Bot className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            PDF Manual Expert
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ask me anything about your uploaded manuals.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserMessage key={msg.id} message={msg} />
          ) : (
            <AssistantMessage
              key={msg.id}
              message={msg}
              onCitationClick={onCitationClick}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
