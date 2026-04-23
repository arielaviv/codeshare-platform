export function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\u001b[NOPX^_\\\]].*?(?:\u001b\\|\u0007)/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '')
    .replace(/\\x1[Bb]\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\\u001[Bb]\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\[\??[\d;]*[A-HJKSTfhilmnsu]/g, '')
    .replace(/\r(?!\n)/g, '');
}

export function isSpinnerLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^[|/\\\-⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/.test(trimmed)) return true;
  return false;
}
