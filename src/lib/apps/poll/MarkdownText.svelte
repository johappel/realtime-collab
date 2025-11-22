<script lang="ts">
    import { marked } from 'marked';
    import DOMPurify from 'isomorphic-dompurify';

    let { text = '' } = $props<{ text: string }>();

    // Configure marked for inline rendering
    marked.setOptions({
        breaks: true,
        gfm: true,
    });

    // Parse and sanitize markdown
    let html = $derived.by(() => {
        if (!text) return '';
        
        // Convert URLs to links if not already in markdown format
        let processedText = text.replace(
            /(?<!\[.*)\b(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
            (url) => {
                // Shorten display text for long URLs
                const displayUrl = url.length > 50 
                    ? url.substring(0, 47) + '...' 
                    : url;
                return `[${displayUrl}](${url})`;
            }
        );

        // Parse markdown
        const parsed = marked.parseInline(processedText) as string;
        
        // Sanitize HTML to prevent XSS
        return DOMPurify.sanitize(parsed, {
            ALLOWED_TAGS: ['a', 'strong', 'em', 'code', 'del', 'br'],
            ALLOWED_ATTR: ['href', 'target', 'rel'],
            ALLOW_DATA_ATTR: false,
        });
    });
</script>

<span class="markdown-text">
    {@html html}
</span>

<style>
    .markdown-text :global(a) {
        color: #3b82f6;
        text-decoration: underline;
        transition: color 0.2s;
    }

    .markdown-text :global(a:hover) {
        color: #2563eb;
    }

    :global(.dark) .markdown-text :global(a) {
        color: #60a5fa;
    }

    :global(.dark) .markdown-text :global(a:hover) {
        color: #93c5fd;
    }

    .markdown-text :global(strong) {
        font-weight: 600;
    }

    .markdown-text :global(em) {
        font-style: italic;
    }

    .markdown-text :global(code) {
        background-color: #f3f4f6;
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.875em;
    }

    :global(.dark) .markdown-text :global(code) {
        background-color: #374151;
    }

    .markdown-text :global(del) {
        text-decoration: line-through;
        opacity: 0.7;
    }
</style>
