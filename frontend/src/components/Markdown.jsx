import React from 'react';

export default function Markdown({ content }) {
  if (!content) return null;

  // Split content by code blocks first
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.startsWith('```')) {
          // It's a code block
          const lines = block.split('\n');
          // Extract language if present (e.g., ```javascript -> javascript)
          const firstLine = lines[0].replace('```', '').trim();
          const language = firstLine || 'code';
          
          // Skip first line and last line (```)
          const codeLines = lines.slice(1, -1).join('\n');
          
          return (
            <div key={index} className="my-3 rounded-xl overflow-hidden shadow-sm border border-gray-200">
              <div className="bg-gray-100 px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 flex justify-between items-center">
                <span>{language}</span>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-4 overflow-x-auto font-mono text-xs shadow-inner">
                <code>{codeLines}</code>
              </pre>
            </div>
          );
        }

        // It's normal text, split into paragraphs/lines
        const lines = block.split('\n');
        let inList = false;
        let listItems = [];
        const renderedLines = [];

        const flushList = (key) => {
          if (listItems.length > 0) {
            renderedLines.push(
              <ul key={`list-${key}`} className="list-disc pl-5 space-y-1.5 my-2">
                {listItems.map((item, i) => (
                  <li key={i} className="text-gray-700 text-sm leading-relaxed">{renderInlineStyles(item)}</li>
                ))}
              </ul>
            );
            listItems = [];
            inList = false;
          }
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          if (trimmed.startsWith('#')) {
            flushList(i);
            const level = trimmed.match(/^#+/)[0].length;
            const text = trimmed.replace(/^#+\s*/, '');
            const sizeClass = 
              level === 1 ? 'text-xl font-extrabold text-gray-900 mt-4 mb-2' :
              level === 2 ? 'text-lg font-bold text-gray-800 mt-3 mb-2' :
              level === 3 ? 'text-base font-bold text-gray-800 mt-3 mb-1' :
              'text-sm font-bold text-gray-700 mt-2 mb-1';
            renderedLines.push(
              <div key={i} className={sizeClass}>
                {renderInlineStyles(text)}
              </div>
            );
          } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            inList = true;
            listItems.push(trimmed.replace(/^[-*]\s*/, ''));
          } else if (trimmed.match(/^\d+\.\s/)) {
            // Numbered list items
            inList = true;
            listItems.push(trimmed.replace(/^\d+\.\s*/, ''));
          } else {
            if (trimmed === '') {
              flushList(i);
            } else {
              if (inList) {
                flushList(i);
              }
              renderedLines.push(
                <p key={i} className="text-gray-700 text-sm leading-relaxed mb-2.5">
                  {renderInlineStyles(line)}
                </p>
              );
            }
          }
        }
        flushList(lines.length);

        return <div key={index}>{renderedLines}</div>;
      })}
    </div>
  );
}

function renderInlineStyles(text) {
  if (!text) return '';

  // Match bold (**text**), inline code (`code`), and links ([text](url))
  const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx} className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-mono text-xs border border-red-100">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('[') && part.includes('](')) {
      const match = part.match(/\[(.*?)\]\((.*?)\)/);
      if (match) {
        return (
          <a
            key={idx}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 hover:text-orange-700 hover:underline font-semibold"
          >
            {match[1]}
          </a>
        );
      }
    }
    return part;
  });
}
