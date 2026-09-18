import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { Todo } from "../../types";
import { Spinner } from "./Spinner";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TodoPanel({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [newText, setNewText] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: () => api.get<Todo[]>("/todos"),
    enabled: open,
  });

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const createMutation = useMutation({
    mutationFn: (text: string) => api.post<Todo>("/todos", { text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["todos"] });
      setNewText("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, erledigt }: { id: number; erledigt: boolean }) =>
      api.put<Todo>(`/todos/${id}`, { erledigt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todos"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      api.put<Todo>(`/todos/${id}`, { text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["todos"] });
      setEditId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/todos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todos"] }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = newText.trim();
    if (t) createMutation.mutate(t);
  }

  function startEdit(todo: Todo) {
    setEditId(todo.id);
    setEditText(todo.text);
  }

  function saveEdit(id: number) {
    const t = editText.trim();
    if (t) updateMutation.mutate({ id, text: t });
  }

  const offen = todos.filter((t) => !t.erledigt);
  const erledigt = todos.filter((t) => t.erledigt);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 max-w-full bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
              Aufgaben
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {offen.length} offen · {erledigt.length} erledigt
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Add form */}
        <form onSubmit={handleAdd} className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Neue Aufgabe…"
              className="input flex-1 text-sm"
            />
            <button
              type="submit"
              disabled={!newText.trim() || createMutation.isPending}
              className="btn btn-primary btn-sm"
            >
              {createMutation.isPending ? "…" : "+"}
            </button>
          </div>
        </form>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : todos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Keine Aufgaben. Füge oben eine hinzu.
            </p>
          ) : (
            <>
              {/* Open todos */}
              {offen.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  isEditing={editId === todo.id}
                  editText={editText}
                  onEditText={setEditText}
                  onToggle={() => toggleMutation.mutate({ id: todo.id, erledigt: true })}
                  onStartEdit={() => startEdit(todo)}
                  onSaveEdit={() => saveEdit(todo.id)}
                  onCancelEdit={() => setEditId(null)}
                  onDelete={() => deleteMutation.mutate(todo.id)}
                  isPending={toggleMutation.isPending || updateMutation.isPending}
                />
              ))}

              {/* Divider if both sections exist */}
              {offen.length > 0 && erledigt.length > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                  <span className="text-xs text-gray-400">Erledigt</span>
                  <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                </div>
              )}

              {/* Done todos */}
              {erledigt.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  isEditing={false}
                  editText=""
                  onEditText={() => {}}
                  onToggle={() => toggleMutation.mutate({ id: todo.id, erledigt: false })}
                  onStartEdit={() => {}}
                  onSaveEdit={() => {}}
                  onCancelEdit={() => {}}
                  onDelete={() => deleteMutation.mutate(todo.id)}
                  isPending={toggleMutation.isPending}
                />
              ))}
            </>
          )}
        </div>

        {/* API hint for LLM */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400 font-mono">
            GET/POST/PUT/DELETE /api/v1/todos
          </p>
        </div>
      </div>
    </>
  );
}

function TodoItem({
  todo,
  isEditing,
  editText,
  onEditText,
  onToggle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  isPending,
}: {
  todo: Todo;
  isEditing: boolean;
  editText: string;
  onEditText: (v: string) => void;
  onToggle: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  return (
    <div
      className={`group flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
        todo.erledigt
          ? "opacity-50"
          : "hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        disabled={isPending}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          todo.erledigt
            ? "border-green-500 bg-green-500 text-white"
            : "border-gray-300 dark:border-gray-600 hover:border-green-400"
        }`}
      >
        {todo.erledigt && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Text / Edit */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex gap-1">
            <input
              autoFocus
              value={editText}
              onChange={(e) => onEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              className="input text-sm flex-1"
            />
            <button onClick={onSaveEdit} className="btn btn-primary btn-sm">
              <CheckIcon className="w-4 h-4" />
            </button>
            <button onClick={onCancelEdit} className="btn btn-secondary btn-sm">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <p
            className={`text-sm leading-snug break-words ${
              todo.erledigt
                ? "line-through text-gray-400 dark:text-gray-500"
                : "text-gray-800 dark:text-gray-100"
            }`}
          >
            {todo.text}
          </p>
        )}
      </div>

      {/* Actions (shown on hover for open todos) */}
      {!isEditing && !todo.erledigt && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={onStartEdit}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded"
            title="Bearbeiten"
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-500 p-1 rounded"
            title="Löschen"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {!isEditing && todo.erledigt && (
        <button
          onClick={onDelete}
          className="flex-shrink-0 text-gray-300 hover:text-red-400 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="Löschen"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
