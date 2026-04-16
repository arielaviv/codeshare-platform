import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import mongoose from 'mongoose';
import { Book, type IBookAuditIssue } from '../../models/Book';
import { UsageEvent } from '../../models/UsageEvent';
import { craftBibleFor } from '../writing/craft-bible';
import { loadE2BConfig, connectComputeSandbox } from '../computer/e2b-client';
import { upsertSession } from '../computer/e2b-session-store';

/**
 * Continuity Auditor — Slice 5 pass 1.
 *
 * Reads the full drafted manuscript (latest per chapter: proofed → edited →
 * raw), calls Sonnet once with a `flag_issues` tool, persists the returned
 * IBookAuditIssue[] on book.auditIssues, and writes a human-readable
 * /book/audit.md.
 *
 * Not a tool loop — one request, one structured response. Continuity
 * checking is a classifier-style task and benefits from seeing the whole
 * book in a single context.
 */

export interface AuditSSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface RunAuditOptions {
  bookId: string;
  userId: mongoose.Types.ObjectId;
  sessionId?: string;
}

const AUDIT_MODEL = 'claude-sonnet-4-6';
const SANDBOX_BOOK_DIR = '/home/user/book';

const flagIssuesTool: Tool = {
  name: 'flag_issues',
  description:
    'Record continuity issues in the drafted manuscript. Always call this tool. Return at most 12 issues; if the manuscript is clean, return an empty array — do not invent issues.',
  input_schema: {
    type: 'object' as const,
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object' as const,
          properties: {
            kind: {
              type: 'string',
              enum: ['character', 'timeline', 'setting', 'name', 'tone', 'continuity'],
            },
            chapterRange: {
              type: 'array',
              items: { type: 'number' },
              description: '1-based chapter numbers involved. Single issues have one element.',
            },
            description: {
              type: 'string',
              description: 'One factual sentence, ≤200 chars. No style judgment.',
            },
            suggestedFix: {
              type: 'string',
              description: 'Smallest edit that resolves the issue, ≤200 chars. Prefer "change X to Y in chapter K" over restructuring.',
            },
          },
          required: ['kind', 'chapterRange', 'description', 'suggestedFix'],
        },
      },
    },
    required: ['issues'],
  },
};

interface AuditToolInput {
  issues: Array<{
    kind: string;
    chapterRange: number[];
    description: string;
    suggestedFix: string;
  }>;
}

function buildSystemPrompt(): string {
  return [
    `You are the Mr8 Continuity Auditor — a senior copy-editor who reads a full manuscript once and flags ONLY objective, factual inconsistencies.`,
    '',
    craftBibleFor({ purpose: 'audit' }),
  ].join('\n');
}

function buildManuscriptPayload(
  chapters: Array<{ n: number; title: string; text: string; wordCount?: number }>
): string {
  const body = chapters
    .map(
      (ch) =>
        `### CHAPTER ${ch.n} — ${ch.title} (${ch.wordCount ?? wordCountOf(ch.text)} words)\n\n${ch.text.trim()}`
    )
    .join('\n\n---\n\n');
  return `# FULL MANUSCRIPT (audit this whole thing)\n\n${body}`;
}

function wordCountOf(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

function renderAuditMarkdown(title: string, issues: IBookAuditIssue[]): string {
  if (issues.length === 0) {
    return `# ${title} — Audit\n\n*No continuity issues flagged.*\n`;
  }
  const rows = issues
    .map((issue, i) => {
      const range = issue.chapterRange.length > 1 ? `ch${issue.chapterRange.join(', ch')}` : `ch${issue.chapterRange[0]}`;
      return `## ${i + 1}. ${issue.kind.toUpperCase()} — ${range}\n\n**Issue:** ${issue.description}\n\n**Suggested fix:** ${issue.suggestedFix}\n`;
    })
    .join('\n');
  return `# ${title} — Audit (${issues.length} issue${issues.length === 1 ? '' : 's'})\n\n${rows}`;
}

/**
 * Read the latest prose for each chapter from the E2B sandbox.
 * Preference order: proofed > edited > raw draft. Missing files are skipped.
 */
async function loadManuscript(
  userId: string,
  sandboxId: string,
  chapters: Array<{ n: number; title: string; proofedPath?: string; editedPath?: string; draftPath?: string; wordCount?: number }>
): Promise<Array<{ n: number; title: string; text: string; wordCount?: number }>> {
  const config = loadE2BConfig();
  const sbx = await connectComputeSandbox(config, sandboxId);
  const loaded: Array<{ n: number; title: string; text: string; wordCount?: number }> = [];
  for (const ch of chapters) {
    const path = ch.proofedPath ?? ch.editedPath ?? ch.draftPath;
    if (!path) continue;
    try {
      const content = await sbx.files.read(`${SANDBOX_BOOK_DIR}/${path}`);
      if (typeof content === 'string' && content.trim().length > 0) {
        loaded.push({ n: ch.n, title: ch.title, text: content, wordCount: ch.wordCount });
      }
    } catch {
      // skip missing/unreadable chapter
    }
  }
  await sbx.pause().catch(() => {});
  upsertSession(userId, { status: 'paused' });
  return loaded;
}

export async function runContinuityAudit(
  opts: RunAuditOptions,
  writer: AuditSSEWriter
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writer.send('error', { message: 'ANTHROPIC_API_KEY not configured' });
    writer.end();
    return;
  }

  const book = await Book.findById(opts.bookId);
  if (!book) {
    writer.send('error', { message: 'Book not found' });
    writer.end();
    return;
  }
  if (book.userId.toString() !== opts.userId.toString()) {
    writer.send('error', { message: 'Book not accessible' });
    writer.end();
    return;
  }
  if (!book.chapters || book.chapters.length === 0) {
    writer.send('error', { message: 'No chapters to audit yet' });
    writer.end();
    return;
  }
  if (!book.sandboxId) {
    writer.send('error', { message: 'Book has no sandbox — draft the chapters first' });
    writer.end();
    return;
  }

  writer.send('stage_started', { stage: 'audit' });
  writer.send('audit.loading_manuscript', { chapterCount: book.chapters.length });

  let manuscript: Array<{ n: number; title: string; text: string; wordCount?: number }>;
  try {
    manuscript = await loadManuscript(
      opts.userId.toString(),
      book.sandboxId,
      book.chapters.map((c) => ({
        n: c.n,
        title: c.title,
        proofedPath: c.proofedPath,
        editedPath: c.editedPath,
        draftPath: c.draftPath,
        wordCount: c.wordCount,
      }))
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Failed to read manuscript: ${msg}` });
    writer.end();
    return;
  }

  if (manuscript.length === 0) {
    writer.send('error', { message: 'No chapter text found on disk — nothing to audit' });
    writer.end();
    return;
  }

  writer.send('audit.auditing', { wordCount: manuscript.reduce((a, c) => a + wordCountOf(c.text), 0) });

  let issuesInput: AuditToolInput;
  let usageInput = 0;
  let usageOutput = 0;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: AUDIT_MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(),
      tools: [flagIssuesTool],
      tool_choice: { type: 'tool', name: 'flag_issues' },
      messages: [{ role: 'user', content: buildManuscriptPayload(manuscript) }],
    });
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'flag_issues') {
      throw new Error('Auditor did not return issues via the tool');
    }
    issuesInput = toolUse.input as AuditToolInput;
    usageInput = response.usage?.input_tokens ?? 0;
    usageOutput = response.usage?.output_tokens ?? 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.send('error', { message: `Audit call failed: ${msg}` });
    writer.end();
    return;
  }

  // Normalize + validate every issue before persisting.
  const allowedKinds: Set<IBookAuditIssue['kind']> = new Set([
    'character',
    'timeline',
    'setting',
    'name',
    'tone',
    'continuity',
  ]);
  const issues: IBookAuditIssue[] = (issuesInput.issues ?? [])
    .slice(0, 12)
    .map((raw) => {
      const kind = allowedKinds.has(raw.kind as IBookAuditIssue['kind']) ? (raw.kind as IBookAuditIssue['kind']) : 'continuity';
      const range = (raw.chapterRange ?? [])
        .filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 1)
        .map((n) => Math.floor(n));
      return {
        kind,
        chapterRange: range.length > 0 ? range : [1],
        description: (raw.description ?? '').slice(0, 1000).trim(),
        suggestedFix: (raw.suggestedFix ?? '').slice(0, 1000).trim(),
        resolved: false,
      };
    })
    .filter((issue) => issue.description.length > 0 && issue.suggestedFix.length > 0);

  book.auditIssues = issues;
  book.markModified('auditIssues');
  await book.save();

  // Write /book/audit.md for observability (Mr8 Computer modal).
  try {
    const config = loadE2BConfig();
    const sbx = await connectComputeSandbox(config, book.sandboxId);
    const md = renderAuditMarkdown(book.title, issues);
    await sbx.files.write(`${SANDBOX_BOOK_DIR}/audit.md`, md);
    await sbx.pause().catch(() => {});
    upsertSession(opts.userId.toString(), { status: 'paused' });
  } catch {
    // non-fatal — the DB copy is authoritative
  }

  try {
    await UsageEvent.create({
      userId: opts.userId,
      sessionId: opts.sessionId ? new mongoose.Types.ObjectId(opts.sessionId) : undefined,
      feature: 'book-audit',
      modelName: AUDIT_MODEL,
      inputTokens: usageInput,
      outputTokens: usageOutput,
    });
  } catch {
    // ignore
  }

  writer.send('audit.issues_ready', {
    bookId: book._id.toString(),
    issueCount: issues.length,
    issues,
  });
  writer.send('stage_complete', { stage: 'audit', status: 'done', summary: issues.length === 0 ? 'No continuity issues found.' : `${issues.length} issue${issues.length === 1 ? '' : 's'} flagged.` });
}
