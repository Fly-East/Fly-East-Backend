export interface QueueAttachment {
  filename?: string;
  content?: string;
  encoding?: string;
  path?: string;
  contentType?: string;
}

export interface EmailJob {
  to: string;
  subject: string;
  template?: string;
  templateData?: Record<string, unknown>;
  html?: string;
  text?: string;
  attachments?: QueueAttachment[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}
