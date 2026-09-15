import { Resend, type CreateEmailOptions } from 'resend';

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
  // Resend tipizza il payload come unione "html | text | react" obbligatorio:
  // il nostro wrapper accetta html e/o text opzionali (a runtime ne passiamo
  // sempre almeno uno), quindi il cast è sicuro e non cambia il comportamento.
  const payload: CreateEmailOptions = {
    from: input.from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    headers: input.headers,
  } as CreateEmailOptions;
  return client().emails.send(payload);
}
