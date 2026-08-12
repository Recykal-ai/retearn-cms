"use client";

import TiptapCodeBlock from "@tiptap/extension-code-block";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type ReactNodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";

// Notion's own code block: always-dark card regardless of the page's own
// light/dark theme, a language picker + copy + "…" row docked top-right,
// visible on hover (not permanently, to stay out of the way while typing).
// Deliberately no syntax-highlighting engine (lowlight/highlight.js) —
// that's a real dependency + per-language color ramp this app doesn't have
// yet; the block still keeps `language` as a real stored attribute (so
// adding highlighting later is a rendering change only, not a schema one),
// it just isn't colorized today.
const LANGUAGES = [
  "Plain text",
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C",
  "C++",
  "C#",
  "Go",
  "Rust",
  "SQL",
  "HTML",
  "CSS",
  "JSON",
  "YAML",
  "Bash",
  "Markdown",
];

function CodeBlockView({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const language = (node.attrs.language as string | null) ?? "";

  function copyCode() {
    navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function deleteBlock() {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }

  return (
    <NodeViewWrapper
      as="div"
      className="group/codeblock relative my-2 overflow-hidden rounded-lg"
      style={{ background: "#1e1e1e" }}
    >
      <div className="flex items-center justify-end gap-1.5 px-3 pt-2 opacity-0 transition-opacity group-hover/codeblock:opacity-100 has-[:focus]:opacity-100">
        <select
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value === "Plain text" ? null : e.target.value })}
          contentEditable={false}
          className="rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs text-neutral-300 outline-none hover:bg-neutral-800"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l} style={{ background: "#1e1e1e" }}>
              {l}
            </option>
          ))}
        </select>
        <button
          type="button"
          contentEditable={false}
          onClick={copyCode}
          title={copied ? "Copied!" : "Copy code"}
          className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <Icon name={copied ? "Interface/Check" : "Edit/Copy"} size={13} />
        </button>
        <div className="relative">
          <button
            type="button"
            contentEditable={false}
            onClick={() => setMenuOpen((v) => !v)}
            title="More"
            className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <Icon name="Menu/More_Horizontal" size={13} />
          </button>
          {menuOpen && (
            <div
              contentEditable={false}
              className="absolute top-full right-0 z-10 mt-1 w-32 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg"
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  deleteBlock();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-neutral-700"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <NodeViewContent<"pre">
        as="pre"
        className="overflow-x-auto"
        // Inline, not Tailwind classes — globals.css's pre-existing
        // `.ProseMirror pre` rule (auto code-block-on-paste feature) ties
        // in specificity with any class selector Tailwind would generate
        // here, and a tie resolves by stylesheet source order rather than
        // intent. Inline styles always win regardless of that order, so
        // every property globals.css also sets (margin, padding, background,
        // color, font) is pinned here instead of left to the cascade.
        style={{
          margin: 0,
          padding: "4px 16px 16px",
          background: "transparent",
          border: "none",
          color: "#f5f5f5",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      />
    </NodeViewWrapper>
  );
}

export const CodeBlock = TiptapCodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
