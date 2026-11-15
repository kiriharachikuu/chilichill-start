import type { FastifyInstance } from 'fastify';
import { HttpError } from '../lib/errors';
import { getStorage } from '../services/storage';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const INVALID_FILE_MESSAGE = '仅支持 png/jpg/jpeg/webp 且不超过 5MB';

const ALLOWED_TYPES: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
};

export function uploadRoutes(app: FastifyInstance) {
  app.post('/api/uploads', { preHandler: [app.authenticate] }, async (request) => {
    const part = await request.file();

    if (!part) {
      throw new HttpError(400, 'INVALID_FILE', INVALID_FILE_MESSAGE);
    }

    if (part.fieldname !== 'file') {
      throw new HttpError(400, 'INVALID_FILE', INVALID_FILE_MESSAGE);
    }

    const extension = part.filename.includes('.') ? (part.filename.split('.').pop() ?? '').toLowerCase() : '';
    const allowedExtensions = ALLOWED_TYPES[part.mimetype];

    if (!allowedExtensions || !allowedExtensions.includes(extension)) {
      throw new HttpError(400, 'INVALID_FILE', INVALID_FILE_MESSAGE);
    }

    const buffer = await part.toBuffer();
    if (part.file.truncated || buffer.length > MAX_FILE_SIZE) {
      throw new HttpError(400, 'INVALID_FILE', INVALID_FILE_MESSAGE);
    }

    const storage = await getStorage();
    const result = await storage.save(buffer, {
      filename: part.filename,
      mimeType: part.mimetype,
    });

    return { url: result.url, key: result.key };
  });
}
