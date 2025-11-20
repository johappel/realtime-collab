<script lang="ts">
  import Settings from "lucide-svelte/icons/settings";
  import X from "lucide-svelte/icons/x";
  import Download from "lucide-svelte/icons/download";

  let {
    open = $bindable(false),
    maxWidth = $bindable(1024),
    onDownload,
    anchorElement,
  } = $props<{
    open: boolean;
    maxWidth: number;
    onDownload: (format: "markdown" | "html" | "doc") => void;
    anchorElement?: HTMLElement | null;
  }>();

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      updatePosition();
    } else if (!open && dialog && dialog.open) {
      dialog.close();
    }
  });

  function updatePosition() {
    if (!dialog || !anchorElement) return;
    
    const rect = anchorElement.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    
    // Position below the anchor, aligned to the right
    let top = rect.bottom + 8;
    let left = rect.right - dialogRect.width;
    
    // Ensure it doesn't go off-screen
    if (left < 10) left = 10;
    
    dialog.style.margin = '0';
    dialog.style.position = 'fixed';
    dialog.style.top = `${top}px`;
    dialog.style.left = `${left}px`;
  }

  function close() {
    open = false;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialog) {
      close();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  onclose={close}
  onclick={handleBackdropClick}
  class="settings-dialog"
>
  <div class="dialog-header">
    <h2>Einstellungen</h2>
    <button class="icon-button" onclick={close} aria-label="Schließen">
      <X size={20} />
    </button>
  </div>

  <div class="dialog-content">
    <div class="setting-group">
      <label for="max-width">Maximale Breite Editor (px)</label>
      <div class="input-wrapper">
        <input
          id="max-width"
          type="number"
          bind:value={maxWidth}
          min="400"
          max="4000"
          step="10"
        />
        <span class="unit">px</span>
      </div>
    </div>

    <div class="setting-group">
      <span class="label">Download als</span>
      <div class="download-buttons">
        <button class="btn-secondary" onclick={() => onDownload("markdown")}>
          <Download size={16} /> Markdown
        </button>
        <button class="btn-secondary" onclick={() => onDownload("html")}>
          <Download size={16} /> HTML
        </button>
        <button class="btn-secondary" onclick={() => onDownload("doc")}>
          <Download size={16} /> Doc
        </button>
      </div>
    </div>
  </div>
</dialog>

<style>
  .settings-dialog {
    border: none;
    border-radius: 0.75rem;
    padding: 0;
    box-shadow:
      0 20px 25px -5px rgb(0 0 0 / 0.1),
      0 8px 10px -6px rgb(0 0 0 / 0.1);
    width: 90%;
    max-width: 400px;
    background: white;
  }

  .settings-dialog::backdrop {
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(2px);
  }

  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }

  .dialog-content {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .setting-group label,
  .setting-group .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-wrapper input {
    width: 100%;
    padding: 0.5rem 2.5rem 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .input-wrapper .unit {
    position: absolute;
    right: 0.75rem;
    color: #6b7280;
    font-size: 0.875rem;
    pointer-events: none;
  }

  .download-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
  }

  .btn-secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background-color: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    color: #374151;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    background-color: #e5e7eb;
    color: #111827;
  }

  .icon-button {
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-button:hover {
    background-color: #f3f4f6;
    color: #111827;
  }
</style>
