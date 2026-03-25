"use client";

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

const SUGGESTIONS = [
  "What are the key features of this product?",
  "How do I set up the device for the first time?",
  "What are the safety precautions?",
  "How do I troubleshoot common issues?",
  "What are the technical specifications?",
  "How do I update the firmware?",
];

export default function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2 px-4 pb-2">
      {SUGGESTIONS.map((q) => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
