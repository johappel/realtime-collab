<script lang="ts">
  import type { Editor } from "@tiptap/core";
  import Bold from "lucide-svelte/icons/bold";
  import Italic from "lucide-svelte/icons/italic";
  import Undo2 from "lucide-svelte/icons/undo-2";
  import Redo2 from "lucide-svelte/icons/redo-2";
  import Heading1 from "lucide-svelte/icons/heading-1";
  import Heading2 from "lucide-svelte/icons/heading-2";
  import Quote from "lucide-svelte/icons/quote";
  import List from "lucide-svelte/icons/list";
  import ListOrdered from "lucide-svelte/icons/list-ordered";
  import Code from "lucide-svelte/icons/code";
  import SquareCode from "lucide-svelte/icons/square-code";

  let { editor } = $props<{ editor: Editor | null }>();
</script>

<div class="toolbar">
  <button
    type="button"
    class="toolbar-button"
    aria-label="Undo"
    title="Undo"
    onclick={() => editor?.chain().focus().undo().run()}
    disabled={!editor || !editor.can().undo()}
  >
    <Undo2 size={18} />
  </button>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Redo"
    title="Redo"
    onclick={() => editor?.chain().focus().redo().run()}
    disabled={!editor || !editor.can().redo()}
  >
    <Redo2 size={18} />
  </button>
  <span class="toolbar-separator" aria-hidden="true"></span>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Bold"
    title="Bold"
    onclick={() => editor?.chain().focus().toggleBold().run()}
    disabled={!editor}
  >
    <Bold size={18} />
  </button>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Italic"
    title="Italic"
    onclick={() => editor?.chain().focus().toggleItalic().run()}
    disabled={!editor}
  >
    <Italic size={18} />
  </button>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Inline code"
    title="Inline code"
    onclick={() => editor?.chain().focus().toggleCode().run()}
    disabled={!editor}
  >
    <Code size={18} />
  </button>
  <span class="toolbar-separator" aria-hidden="true"></span>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Heading 1"
    title="Heading 1"
    onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
    disabled={!editor}
  >
    <Heading1 size={18} />
  </button>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Heading 2"
    title="Heading 2"
    onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
    disabled={!editor}
  >
    <Heading2 size={18} />
  </button>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Blockquote"
    title="Blockquote"
    onclick={() => editor?.chain().focus().toggleBlockquote().run()}
    disabled={!editor}
  >
    <Quote size={18} />
  </button>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Bullet list"
    title="Bullet list"
    onclick={() => editor?.chain().focus().toggleBulletList().run()}
    disabled={!editor}
  >
    <List size={18} />
  </button>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Ordered list"
    title="Ordered list"
    onclick={() => editor?.chain().focus().toggleOrderedList().run()}
    disabled={!editor}
  >
    <ListOrdered size={18} />
  </button>
  <button
    type="button"
    class="toolbar-button"
    aria-label="Code block"
    title="Code block"
    onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
    disabled={!editor}
  >
    <SquareCode size={18} />
  </button>
</div>

<style>
  .toolbar {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    border: 1px solid transparent;
    background-color: transparent;
    cursor: pointer;
    color: #4b5563;
    transition: all 0.2s;
  }

  .toolbar-button:hover:not(:disabled) {
    background-color: #f3f4f6;
    color: #111827;
  }

  .toolbar-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .toolbar-separator {
    width: 1px;
    height: 1.5rem;
    background-color: #e5e7eb;
    margin: 0 0.25rem;
  }
</style>
