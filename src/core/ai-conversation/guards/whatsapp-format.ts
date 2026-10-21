export type WhatsAppFormatFix = 'markdown_links' | 'headers' | 'tables' | 'bold';

export function formatForWhatsApp(input: string): { text: string; fixes: WhatsAppFormatFix[] } {
  const fixes = new Set<WhatsAppFormatFix>();
  let text = input.replace(/\[([^\]\n]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)(?:\s+"[^"]*")?\)/g, (_, label: string, url: string) => {
    fixes.add('markdown_links');
    return `${label}: ${url}`;
  });
  text = text.replace(/^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/gm, (_, title: string) => {
    fixes.add('headers');
    return title;
  });
  text = text.replace(/^([^\n]+)\n {0,3}(?:={3,}|-{3,})[ \t]*(?=\n|$)/gm, (_, title: string) => {
    fixes.add('headers');
    return title;
  });
  const lines = text.split('\n');
  const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  const separator = (line: string) => line.includes('|') && cells(line).every(cell => /^:?-{3,}:?$/.test(cell));
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].includes('|') && index + 1 < lines.length && separator(lines[index + 1])) {
      fixes.add('tables');
      const headings = cells(lines[index]);
      index += 2;
      let rows = 0;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        const values = cells(lines[index]);
        output.push(values.map((value, column) => headings[column] ? `${headings[column]}: ${value}` : value).join('; '));
        rows++;
        index++;
      }
      if (!rows) output.push(headings.join('; '));
      index--;
    } else {
      output.push(lines[index]);
    }
  }
  text = output.join('\n').replace(/\*\*([^*]+)\*\*/g, (_, value: string) => {
    fixes.add('bold');
    return `*${value}*`;
  });
  return { text, fixes: Array.from(fixes) };
}
