"use client";

import { FileText, Settings, Trash2 } from "lucide-react";

interface HeaderProps {
  onSettingsClick: () => void;
}

export default function Header({ onSettingsClick }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-blue-600" />
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          PDF Manual Expert
        </h1>
      </div>
      <button
        onClick={onSettingsClick}
        className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        title="Settings"
      >
        <Settings className="h-5 w-5" />
      </button>
    </header>
  );
}
