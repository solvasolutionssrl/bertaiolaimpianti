import { Resend } from 'resend';

let cached: Resend | null = null;
function client() {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY');
  cached = new Resend(apiKey);
  return cached;
}

export interface SendEmailInput {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function sendEmail(input: SendEmailInput) {
  return client().emails.send({
    from: input.from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    headers: input.headers,
  });
}

/** Parsing minimal di una webhook payload Resend "email.received" → ticket draft. */
export interface InboundEmail {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  threadId?: string;
  attachments?: Array<{ filename: string; contentType: string; url: string }>;
}

export function parseResendInbound(payload: unknown): InboundEmail | null {
  const data = (payload as { data?: Record<string, unknown> })?.data ?? payload;
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  return {
    from: String(d.from ?? d.from_email ?? ''),
    to: Array.isArray(d.to) ? (d.to as string[]) : [String(d.to ?? '')],
    subject: String(d.subject ?? ''),
    text: typeof d.text === 'string' ? d.text : undefined,
    html: typeof d.html === 'string' ? d.html : undefined,
    threadId: typeof d.message_id === 'string' ? d.message_id : undefined,
    attachments: Array.isArray(d.attachments) ? (d.attachments as InboundEmail['attachments']) : [],
  };
}
