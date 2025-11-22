<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';

	let { text = '', darkText = false } = $props<{ text: string; darkText?: boolean }>();

	// Auto-detect and linkify URLs that aren't already in markdown links
	// Negative lookbehind to avoid URLs that are already part of [text](url)
	const autoLinkText = (input: string): string => {
		const urlRegex = /(?<!\[.*)\b(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
		return input.replace(urlRegex, (url) => {
			// Shorten URL if it's too long
			const displayUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
			return `[${displayUrl}](${url})`;
		});
	};

	const renderMarkdown = (input: string): string => {
		const linkedText = autoLinkText(input);
		
		// Use marked.parse() for block elements (lists) instead of parseInline()
		const html = marked.parse(linkedText) as string;

		// Sanitize HTML to prevent XSS - now including list tags
		return DOMPurify.sanitize(html, {
			ALLOWED_TAGS: ['a', 'strong', 'em', 'code', 'del', 'br', 'ul', 'ol', 'li', 'p'],
			ALLOWED_ATTR: ['href', 'target', 'rel']
		});
	};

	const renderedHtml = $derived(renderMarkdown(text));
</script>

<div class="markdown-text" class:dark-text={darkText}>
	{@html renderedHtml}
</div>

<style>
	.markdown-text {
		display: block;
		word-wrap: break-word;
		overflow-wrap: break-word;
		line-height: 1.5;
	}

	/* Default (light backgrounds) */
	.markdown-text :global(a) {
		color: #2563eb;
		text-decoration: underline;
	}

	.markdown-text :global(a:hover) {
		color: #1d4ed8;
	}

	/* Dark theme (dark backgrounds) */
	:global(.dark) .markdown-text :global(a) {
		color: #60a5fa;
	}

	:global(.dark) .markdown-text :global(a:hover) {
		color: #93c5fd;
	}

	/* For cards with light backgrounds (darkText = true) */
	.markdown-text.dark-text :global(a) {
		color: #1d4ed8;
	}

	.markdown-text.dark-text :global(a:hover) {
		color: #2563eb;
	}

	.markdown-text :global(strong) {
		font-weight: 700;
	}

	.markdown-text :global(em) {
		font-style: italic;
	}

	.markdown-text :global(code) {
		background-color: rgba(0, 0, 0, 0.1);
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: 'Courier New', monospace;
		font-size: 0.875em;
	}

	:global(.dark) .markdown-text :global(code) {
		background-color: #374151;
		color: #e5e7eb;
	}

	.markdown-text.dark-text :global(code) {
		background-color: rgba(0, 0, 0, 0.15);
		color: inherit;
	}

	.markdown-text :global(del) {
		text-decoration: line-through;
		opacity: 0.7;
	}

	/* Paragraph spacing */
	.markdown-text :global(p) {
		margin: 0 0 0.5em 0;
	}

	.markdown-text :global(p:last-child) {
		margin-bottom: 0;
	}

	/* List styles */
	.markdown-text :global(ul),
	.markdown-text :global(ol) {
		margin: 0.5em 0;
		padding-left: 1.5em;
	}

	.markdown-text :global(li) {
		margin: 0.25em 0;
	}

	.markdown-text :global(ul) {
		list-style-type: disc;
	}

	.markdown-text :global(ol) {
		list-style-type: decimal;
	}

	/* Nested lists */
	.markdown-text :global(ul ul),
	.markdown-text :global(ol ul) {
		list-style-type: circle;
	}

	.markdown-text :global(ul ul ul),
	.markdown-text :global(ol ul ul) {
		list-style-type: square;
	}
</style>
