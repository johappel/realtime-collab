<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte";
    import { getOrSetLocalIdentity, clearLocalIdentity } from "$lib/nostrUtils";

    let { onClose = () => {}, open = $bindable(false) } = $props<{
        onClose?: () => void;
        open?: boolean;
    }>();

    let activeTab = $state<"extension" | "group">("extension");
    let groupCode = $state("");
    let nickname = $state("");
    let loading = $state(false);
    let error = $state<string | null>(null);

    // Check URL parameters on mount
    $effect(() => {
        if (typeof window !== "undefined" && open) {
            const params = new URLSearchParams(window.location.search);
            const urlCode = params.get("code");
            const urlName = params.get("name");

            if (urlCode) {
                groupCode = urlCode;
                activeTab = "group";
                if (urlName) {
                    nickname = urlName;
                    // Auto-login if both code and name are provided
                    handleGroupLogin();
                }
            }
        }

        // Load saved nickname
        const savedNickname = getOrSetLocalIdentity();
        if (savedNickname && !nickname) {
            nickname = savedNickname;
        }
    });

    async function handleExtensionLogin() {
        loading = true;
        error = null;

        try {
            if (!window.nostr) {
                throw new Error(
                    "Keine Nostr Extension gefunden. Bitte installiere Alby oder nos2x.",
                );
            }

            appState.setMode("nostr");
            await appState.initNostr();
            onClose();
        } catch (e) {
            error = e instanceof Error ? e.message : "Login fehlgeschlagen";
        } finally {
            loading = false;
        }
    }

    async function handleGroupLogin() {
        if (!groupCode.trim()) {
            error = "Bitte gib einen Gruppen-Code ein";
            return;
        }

        if (!nickname.trim()) {
            error = "Bitte gib deinen Namen ein";
            return;
        }

        loading = true;
        error = null;

        try {
            await appState.setGroupCode(groupCode.trim(), nickname.trim());
            await appState.initGroup();
            onClose();
        } catch (e) {
            error = e instanceof Error ? e.message : "Login fehlgeschlagen";
        } finally {
            loading = false;
        }
    }

    function handleCancel() {
        onClose();
    }
</script>

{#if open}
    <div class="dialog-overlay" onclick={handleCancel}>
        <div class="dialog" onclick={(e) => e.stopPropagation()}>
            <div class="dialog-header">
                <h2>Anmelden</h2>
                <button
                    class="close-btn"
                    onclick={handleCancel}
                    aria-label="Schließen">×</button
                >
            </div>

            <div class="tabs">
                <button
                    class="tab"
                    class:active={activeTab === "extension"}
                    onclick={() => (activeTab = "extension")}
                >
                    <span class="icon">🔑</span>
                    Nostr Extension
                </button>
                <button
                    class="tab"
                    class:active={activeTab === "group"}
                    onclick={() => (activeTab = "group")}
                >
                    <span class="icon">🎓</span>
                    Gruppen-Code
                </button>
            </div>

            <div class="dialog-content">
                {#if error}
                    <div class="error-message">
                        ⚠️ {error}
                    </div>
                {/if}

                {#if activeTab === "extension"}
                    <div class="tab-panel">
                        <p class="description">
                            Nutze deine Nostr Browser Extension (Alby, nos2x)
                            für persönliche Identität.
                        </p>
                        <button
                            class="btn btn-primary"
                            onclick={handleExtensionLogin}
                            disabled={loading}
                        >
                            {loading ? "Verbinde..." : "Mit Extension anmelden"}
                        </button>
                    </div>
                {:else}
                    <div class="tab-panel">
                        <p class="description">
                            Perfekt für Lerngruppen! Gib den Code deiner Gruppe
                            ein.
                        </p>

                        <div class="form-group">
                            <label for="group-code">Gruppen-Code</label>
                            <input
                                id="group-code"
                                type="text"
                                bind:value={groupCode}
                                placeholder="KURS-2024"
                                disabled={loading}
                                onkeydown={(e) =>
                                    e.key === "Enter" && handleGroupLogin()}
                            />
                        </div>

                        <div class="form-group">
                            <label for="nickname">Dein Name</label>
                            <input
                                id="nickname"
                                type="text"
                                bind:value={nickname}
                                placeholder="Max Mustermann"
                                disabled={loading}
                                onkeydown={(e) =>
                                    e.key === "Enter" && handleGroupLogin()}
                            />
                        </div>

                        <button
                            class="btn btn-primary"
                            onclick={handleGroupLogin}
                            disabled={loading ||
                                !groupCode.trim() ||
                                !nickname.trim()}
                        >
                            {loading ? "Trete bei..." : "Gruppe beitreten"}
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .dialog {
        background: white;
        border-radius: 0.75rem;
        box-shadow:
            0 20px 25px -5px rgba(0, 0, 0, 0.1),
            0 10px 10px -5px rgba(0, 0, 0, 0.04);
        max-width: 28rem;
        width: 90%;
        max-height: 90vh;
        overflow: auto;
    }

    :global(.dark) .dialog {
        background: #1f2937;
    }

    .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid #e5e7eb;
    }

    :global(.dark) .dialog-header {
        border-bottom-color: #374151;
    }

    .dialog-header h2 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: #111827;
    }

    :global(.dark) .dialog-header h2 {
        color: #f9fafb;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 2rem;
        line-height: 1;
        color: #6b7280;
        cursor: pointer;
        padding: 0;
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 0.25rem;
        transition: background-color 0.2s;
    }

    .close-btn:hover {
        background-color: #f3f4f6;
    }

    :global(.dark) .close-btn {
        color: #9ca3af;
    }

    :global(.dark) .close-btn:hover {
        background-color: #374151;
    }

    .tabs {
        display: flex;
        border-bottom: 1px solid #e5e7eb;
    }

    :global(.dark) .tabs {
        border-bottom-color: #374151;
    }

    .tab {
        flex: 1;
        padding: 1rem;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        color: #6b7280;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .tab .icon {
        font-size: 1.25rem;
    }

    .tab:hover {
        color: #111827;
        background-color: #f9fafb;
    }

    .tab.active {
        color: #3b82f6;
        border-bottom-color: #3b82f6;
    }

    :global(.dark) .tab {
        color: #9ca3af;
    }

    :global(.dark) .tab:hover {
        color: #f9fafb;
        background-color: #374151;
    }

    :global(.dark) .tab.active {
        color: #60a5fa;
        border-bottom-color: #60a5fa;
    }

    .dialog-content {
        padding: 1.5rem;
    }

    .tab-panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .description {
        margin: 0;
        color: #6b7280;
        font-size: 0.875rem;
        line-height: 1.5;
    }

    :global(.dark) .description {
        color: #9ca3af;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .form-group label {
        font-size: 0.875rem;
        font-weight: 500;
        color: #374151;
    }

    :global(.dark) .form-group label {
        color: #d1d5db;
    }

    .form-group input {
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        font-size: 1rem;
        transition: border-color 0.2s;
    }

    .form-group input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-group input:disabled {
        background-color: #f3f4f6;
        cursor: not-allowed;
    }

    :global(.dark) .form-group input {
        background-color: #374151;
        border-color: #4b5563;
        color: #f9fafb;
    }

    :global(.dark) .form-group input:focus {
        border-color: #60a5fa;
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
    }

    :global(.dark) .form-group input:disabled {
        background-color: #1f2937;
    }

    .btn {
        padding: 0.625rem 1.25rem;
        border: none;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .btn-primary {
        background-color: #3b82f6;
        color: white;
    }

    .btn-primary:hover:not(:disabled) {
        background-color: #2563eb;
    }

    .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .error-message {
        padding: 0.75rem;
        background-color: #fee2e2;
        color: #991b1b;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        border: 1px solid #fecaca;
    }

    :global(.dark) .error-message {
        background-color: #7f1d1d;
        color: #fecaca;
        border-color: #991b1b;
    }
</style>
