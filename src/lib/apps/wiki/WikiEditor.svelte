<script lang="ts">
  import { Editor, Mark, mergeAttributes, InputRule } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Collaboration from "@tiptap/extension-collaboration";
  import CollaborationCaret from "@tiptap/extension-collaboration-caret";
  import { TextStyle } from "@tiptap/extension-text-style";
  import { Color } from "@tiptap/extension-color";
  import { Highlight } from "@tiptap/extension-highlight";
  import { Table } from "@tiptap/extension-table";
  import { TableCell } from "@tiptap/extension-table-cell";
  import { TableHeader } from "@tiptap/extension-table-header";
  import { TableRow } from "@tiptap/extension-table-row";
  import BubbleMenu from "@tiptap/extension-bubble-menu";
  import "$lib/tiptap.css";
  import * as Y from "yjs";
  import { Awareness } from "y-protocols/awareness";

  let {
    fragment,
    awareness,
    user,
    maxWidth = 1024,
    onNavigate,
  } = $props<{
    fragment: Y.XmlFragment;
    awareness: Awareness;
    user: { name: string; color: string };
    maxWidth?: number;
    onNavigate?: (pageTitle: string) => void;
  }>();

  const WikiLink = Mark.create({
    name: 'wikiLink',
    
    addAttributes() {
      return {
        page: {
          default: null,
          parseHTML: element => element.getAttribute('data-page'),
          renderHTML: attributes => {
            return {
              'data-page': attributes.page,
            }
          },
        },
      }
    },

    parseHTML() {
      return [
        {
          tag: 'span[data-wiki-link]',
        },
      ]
    },

    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes(HTMLAttributes, { 'data-wiki-link': '', class: 'wiki-link' }), 0]
    },

    addInputRules() {
      return [
        new InputRule({
          find: /\[([^\]]+)\]$/,
          handler: ({ state, range, match }) => {
            const { tr } = state
            const start = range.from
            const end = range.to
            const text = match[1]
            
            if (text) {
                tr.replaceWith(start, end, state.schema.text(text, [state.schema.marks.wikiLink.create({ page: text })]))
            }
          },
        }),
      ]
    },
  });

  let editorElement: HTMLDivElement | null = $state(null);
  let bubbleMenuElement: HTMLDivElement | null = $state(null);
  let editor: Editor | null = $state(null);

  $effect(() => {
    if (!editorElement || !bubbleMenuElement || !fragment || !awareness) return;

    const instance = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          history: false,
        } as any),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        BubbleMenu.configure({
          element: bubbleMenuElement,
          shouldShow: ({ editor }) => {
            return editor.isActive("table");
          },
        }),
        Collaboration.configure({
          fragment: fragment,
        }),
        CollaborationCaret.configure({
          provider: { awareness },
          user: {
            name: user.name,
            color: user.color,
          },
        }),
        WikiLink,
      ],
      editorProps: {
        attributes: {
          class: "tiptap",
        },
        handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            if (target.closest('.wiki-link')) {
                const page = target.getAttribute('data-page');
                if (page && onNavigate) {
                    onNavigate(page);
                    return true; 
                }
            }
            return false;
        }
      },
    });

    editor = instance;

    return () => {
      instance.destroy();
      editor = null;
    };
  });
  
  $effect(() => {
      if (awareness && user) {
          awareness.setLocalStateField("user", user);
      }
  });

</script>

<div class="editor" style="--editor-max-width: {maxWidth}px">
  <div class="editor-content" bind:this={editorElement}></div>
  
  <div class="bubble-menu" bind:this={bubbleMenuElement}>
    {#if editor}
      <button onclick={() => editor?.chain().focus().addColumnBefore().run()}>Col ←</button>
      <button onclick={() => editor?.chain().focus().addColumnAfter().run()}>Col →</button>
      <button onclick={() => editor?.chain().focus().deleteColumn().run()}>Del Col</button>
      <span class="separator">|</span>
      <button onclick={() => editor?.chain().focus().addRowBefore().run()}>Row ↑</button>
      <button onclick={() => editor?.chain().focus().addRowAfter().run()}>Row ↓</button>
      <button onclick={() => editor?.chain().focus().deleteRow().run()}>Del Row</button>
      <span class="separator">|</span>
      <button onclick={() => editor?.chain().focus().mergeCells().run()}>Merge</button>
      <button onclick={() => editor?.chain().focus().splitCell().run()}>Split</button>
      <span class="separator">|</span>
      <button onclick={() => editor?.chain().focus().deleteTable().run()} class="danger">Delete Table</button>
    {/if}
  </div>
</div>

<style>
  .editor {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    --editor-max-width: 1024px;
  }

  .editor-content {
    flex-grow: 1;
    overflow-y: auto;
    padding: 1rem;
    cursor: text;
    display: flex;
    justify-content: center;
  }

  :global(.editor .tiptap) {
    min-height: 100%;
    outline: none;
    font-size: 1rem;
    line-height: 1.5;
    width: 100%;
    max-width: var(--editor-max-width);
    margin: 0 auto;
  }
  
  .bubble-menu {
    display: flex;
    background-color: white;
    padding: 0.2rem;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    gap: 0.25rem;
    align-items: center;
    visibility: hidden;
  }
  
  :global(.dark) .bubble-menu {
    background-color: #1f2937;
    border-color: #374151;
  }
  
  :global(.tippy-box) .bubble-menu {
    visibility: visible;
  }
  
  .bubble-menu button {
      border: none;
      background: none;
      cursor: pointer;
      padding: 2px 5px;
      color: #374151;
  }
  
  :global(.dark) .bubble-menu button {
      color: #d1d5db;
  }
  
  .bubble-menu button:hover {
      background: #eee;
  }
  
  :global(.dark) .bubble-menu button:hover {
      background: #374151;
  }
  
  .separator {
      color: #ccc;
  }

  :global(.wiki-link) {
      color: #2563eb;
      text-decoration: underline;
      cursor: pointer;
      font-weight: 500;
  }
  
  :global(.wiki-link:hover) {
      color: #1d4ed8;
      background-color: rgba(37, 99, 235, 0.1);
      border-radius: 2px;
  }
</style>
