/**
 * Shared error translation for AI calls made from the Server Monitoring window.
 *
 * The window renders no AI drawer, no provider modal and no toast host, so an
 * error thrown by the store would otherwise surface as a raw string like
 * "NO_PROVIDER" or a bare HTTP error body.
 */
export const AI_FAILURE_MESSAGE: Record<string, string> = {
  NO_PROVIDER:
    'Belum ada AI Provider yang dipilih. Atur di window utama BOBA pada menu AI Copilot → Provider.',
  NO_API_KEY:
    'API Key provider belum diisi. Lengkapi di window utama BOBA pada menu AI Copilot → Provider.',
  BUSY: 'AI sedang memproses permintaan lain. Tunggu sebentar lalu coba lagi.',
  EMPTY_RESPONSE: 'AI tidak memberikan jawaban. Coba lagi beberapa saat lagi.',
  ABORT_ERR: 'Permintaan AI dibatalkan.',
};

export function describeAiFailure(err: unknown): string {
  const code = typeof err === 'string' ? err : (err as { message?: string } | null)?.message || '';
  const known = AI_FAILURE_MESSAGE[code];
  if (known) return known;
  if (!code) return 'Permintaan AI gagal tanpa pesan error.';
  return `Permintaan AI gagal: ${code}`;
}
