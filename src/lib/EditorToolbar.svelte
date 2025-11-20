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
  import Baseline from "lucide-svelte/icons/baseline";
  import Highlighter from "lucide-svelte/icons/highlighter";

  let { editor } = $props<{ editor: Editor | null }>();

  let showColorPalette = $state(false);
  let showHighlightPalette = $state(false);

  const textColors = [
    { name: "Red", value: "#ef4444" },
    { name: "Green", value: "#22c55e" },
    { name: "Orange", value: "#f97316" },
    { name: "Blue", value: "#3b82f6" },
    { name: "Purple", value: "#a855f7" },
    { name: "Black", value: "#000000" }, // Reset option
  ];

  const highlightColors = [
    { name: "Yellow", value: "#fef08a" },
    { name: "Green", value: "#bbf7d0" },
    { name: "Pink", value: "#fbcfe8" },
    { name: "None", value: "" }, // Reset option
  ];

  function toggleColorPalette() {
    showColorPalette = !showColorPalette;
    showHighlightPalette = false;
  }

  function toggleHighlightPalette() {
    showHighlightPalette = !showHighlightPalette;
    showColorPalette = false;
  }

  function setTextColor(color: string) {
    if (color === "#000000") {
      editor?.chain().focus().unsetColor().run();
    } else {
      editor?.chain().focus().setColor(color).run();
    }
    showColorPalette = false;
  }

  function setHighlightColor(color: string) {
    if (!color) {
      editor?.chain().focus().unsetHighlight().run();
    } else {
      editor?.chain().focus().toggleHighlight({ color }).run();
    }
    showHighlightPalette = false;
  }
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

  <span class="toolbar-separator" aria-hidden="true"></span>

  <div class="palette-container">
    <button
      type="button"
      class="toolbar-button"
      aria-label="Text color"
      title="Text color"
      onclick={toggleColorPalette}
      disabled={!editor}
    >
      <Baseline size={18} />
    </button>
    {#if showColorPalette}
      <div class="palette">
        {#each textColors as color}
          <button
            type="button"
            class="palette-button"
            style="background-color: {color.value};"
            title={color.name}
            onclick={() => setTextColor(color.value)}
          ></button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="palette-container">
    <button
      type="button"
      class="toolbar-button"
      aria-label="Highlight"
      title="Highlight"
      onclick={toggleHighlightPalette}
      disabled={!editor}
    >
      <Highlighter size={18} />
    </button>
    {#if showHighlightPalette}
      <div class="palette">
        {#each highlightColors as color}
          {#if color.value}
            <button
              type="button"
              class="palette-button"
              style="background-color: {color.value};"
              title={color.name}
              onclick={() => setHighlightColor(color.value)}
            ></button>
          {:else}
             <button
              type="button"
              class="palette-button reset-button"
              title="Remove highlight"
              onclick={() => setHighlightColor(color.value)}
            >✕</button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
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

  .palette-container {
    position: relative;
  }

  .palette {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.25rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 0.25rem;
    display: flex;
    gap: 0.25rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    z-index: 20;
  }

  .palette-button {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.25rem;
    border: 1px solid #e5e7eb;
    cursor: pointer;
    padding: 0;
  }

  .palette-button:hover {
    transform: scale(1.1);
  }
  
  .reset-button {
    background-color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: #ef4444;
  }
</style>
