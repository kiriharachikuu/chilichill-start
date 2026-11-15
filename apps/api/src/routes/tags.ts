import type { FastifyInstance } from 'fastify';
import { TAG_SCOPES } from '@spaceport/shared';
import { z } from 'zod';
import { optionalEnumQuery, optionalQueryString } from '../lib/query';
import { toTag } from '../lib/serialize';
import { prisma } from '../prisma';
import { suggestTags } from '../services/classification';

const tagsQuerySchema = z.object({
  scope: optionalEnumQuery(TAG_SCOPES),
});

const suggestionsQuerySchema = z.object({
  q: optionalQueryString,
});

export function tagsRoutes(app: FastifyInstance) {
  app.get('/api/tags', async (request) => {
    const query = tagsQuerySchema.parse(request.query ?? {});
    const where =
      query.scope === 'GROUP'
        ? { scope: { in: ['GROUP', 'BOTH'] } }
        : query.scope === 'SITE'
          ? { scope: { in: ['SITE', 'BOTH'] } }
          : {};

    const tags = await prisma.tag.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return { items: tags.map(toTag) };
  });

  app.get('/api/groups/tag-suggestions', async (request) => {
    const query = suggestionsQuerySchema.parse(request.query ?? {});
    const q = query.q ?? '';

    if (q.length < 2) {
      return { items: [] };
    }

    const items = await suggestTags(q, 'GROUP');
    return { items };
  });
}
