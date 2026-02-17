"use client";

import { Fragment } from "react";

function renderInlineMarkdown(text: string) {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
    return parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
            return <code key={`c-${index}`} className="sm-md-inline-code">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return <strong key={`b-${index}`}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return <em key={`i-${index}`}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={`t-${index}`}>{part}</Fragment>;
    });
}

type MessageBlock =
    | { type: "heading"; level: 2 | 3 | 4; text: string }
    | { type: "paragraph"; text: string }
    | { type: "ul"; items: string[] }
    | { type: "ol"; items: string[] };

function isBlockStarter(line: string) {
    return /^(#{1,4})\s+/.test(line) || /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line);
}

function parseMessageBlocks(content: string): MessageBlock[] {
    const lines = content.replace(/\r/g, "").split("\n");
    const blocks: MessageBlock[] = [];
    let i = 0;

    while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (!trimmed) {
            i += 1;
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (headingMatch) {
            const hashes = headingMatch[1].length;
            const level = (hashes <= 1 ? 2 : hashes === 2 ? 3 : 4) as 2 | 3 | 4;
            blocks.push({ type: "heading", level, text: headingMatch[2].trim() });
            i += 1;
            continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
            const items: string[] = [];
            while (i < lines.length) {
                const line = lines[i].trim();
                const match = line.match(/^[-*]\s+(.+)$/);
                if (!match) break;
                items.push(match[1].trim());
                i += 1;
            }
            blocks.push({ type: "ul", items });
            continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
            const items: string[] = [];
            while (i < lines.length) {
                const line = lines[i].trim();
                const match = line.match(/^\d+\.\s+(.+)$/);
                if (!match) break;
                items.push(match[1].trim());
                i += 1;
            }
            blocks.push({ type: "ol", items });
            continue;
        }

        const paragraphLines: string[] = [trimmed];
        i += 1;
        while (i < lines.length) {
            const next = lines[i].trim();
            if (!next || isBlockStarter(next)) break;
            paragraphLines.push(next);
            i += 1;
        }
        blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
    }

    return blocks;
}

export function MessageRenderer({ content }: { content: string }) {
    if (!content) return <p className="sm-md-paragraph"><br /></p>;
    const blocks = parseMessageBlocks(content);

    return blocks.map((block, index) => {
        if (block.type === "heading") {
            const className =
                block.level === 2 ? "sm-md-h2" : block.level === 3 ? "sm-md-h3" : "sm-md-h4";
            return (
                <h3 key={`h-${index}`} className={className}>
                    {renderInlineMarkdown(block.text)}
                </h3>
            );
        }

        if (block.type === "ul") {
            return (
                <ul key={`ul-${index}`} className="sm-md-list">
                    {block.items.map((item, itemIndex) => (
                        <li key={`uli-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
                    ))}
                </ul>
            );
        }

        if (block.type === "ol") {
            return (
                <ol key={`ol-${index}`} className="sm-md-list sm-md-list-ordered">
                    {block.items.map((item, itemIndex) => (
                        <li key={`oli-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
                    ))}
                </ol>
            );
        }

        return (
            <p key={`p-${index}`} className="sm-md-paragraph">
                {renderInlineMarkdown(block.text)}
            </p>
        );
    });
}
