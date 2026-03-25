"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  getProviders,
  getActiveConfig,
  updateProvider,
  ProviderList,
  ActiveConfig,
} from "@/lib/api";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const [providers, setProviders] = useState<ProviderList | null>(null);
  const [config, setConfig] = useState<ActiveConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getProviders().then(setProviders);
      getActiveConfig().then(setConfig);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    try {
      const payload: Record<string, string> = {
        llm_provider: config.llm_provider,
        llm_model: config.llm_model,
        embedding_provider: config.embedding_provider,
        embedding_model: config.embedding_model,
        vector_store_provider: config.vector_store_provider,
      };
      if (apiKey) payload.api_key = apiKey;
      const updated = await updateProvider(payload);
      setConfig(updated);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="w-full max-w-sm overflow-y-auto bg-white p-6 shadow-xl dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {config && providers && (
          <div className="flex flex-col gap-5">
            {/* LLM Provider */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                LLM Provider
              </label>
              <select
                value={config.llm_provider}
                onChange={(e) =>
                  setConfig({ ...config, llm_provider: e.target.value })
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {providers.llm.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* LLM Model */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                LLM Model
              </label>
              <input
                value={config.llm_model}
                onChange={(e) =>
                  setConfig({ ...config, llm_model: e.target.value })
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="e.g. gpt-4o"
              />
            </div>

            {/* Embedding Provider */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Embedding Provider
              </label>
              <select
                value={config.embedding_provider}
                onChange={(e) =>
                  setConfig({ ...config, embedding_provider: e.target.value })
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {providers.embedding.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Vector Store */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Vector Store
              </label>
              <select
                value={config.vector_store_provider}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    vector_store_provider: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {providers.vector_store.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                API Key (optional update)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Enter new API key..."
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
            >
              {saving ? "Saving..." : saved ? "Saved ✓" : "Save & Reconnect"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
