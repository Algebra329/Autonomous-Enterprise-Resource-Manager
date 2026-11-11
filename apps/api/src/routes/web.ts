import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function findWebDistDir(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../../web/dist'),
    path.resolve(__dirname, '../../../../apps/web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === '/v1' ||
    pathname.startsWith('/v1/') ||
    pathname === '/health' ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    pathname === '/openapi.json' ||
    pathname === '/webhooks' ||
    pathname.startsWith('/webhooks/')
  );
}

function safeResolveWithin(rootDir: string, relativePath: string): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, relativePath);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    return null;
  }
  return resolvedTarget;
}

export const webRoutes: FastifyPluginAsync = async (app) => {
  app.setNotFoundHandler((req, reply) => {
    const rawUrl = req.raw.url || '/';
    const pathnameOnly = rawUrl.split('?')[0] || '/';
    let decodedPath = pathnameOnly;
    try {
      decodedPath = decodeURIComponent(pathnameOnly);
    } catch {
      return reply.status(400).send({
        message: 'Invalid URL path',
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    if ((req.method !== 'GET' && req.method !== 'HEAD') || isApiPath(decodedPath)) {
      return reply.status(404).send({
        message: `Route ${req.method}:${rawUrl} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }

    const distDir = findWebDistDir();
    if (!distDir) {
      if (decodedPath === '/') {
        return reply.send({
          status: 'ok',
          service: '@rm/api',
          docs: '/docs',
          health: '/health',
          ui_built: false,
        });
      }
      return reply.status(404).send({
        message: `Route ${req.method}:${rawUrl} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }

    const relPath = decodedPath.replace(/^\/+/, '');
    if (relPath) {
      const candidate = safeResolveWithin(distDir, relPath);
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        if (relPath.startsWith('assets/')) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          reply.header('Cache-Control', 'public, max-age=3600');
        }
        reply.type(contentType);
        return reply.send(fs.createReadStream(candidate));
      }

      if (relPath === 'favicon.ico') {
        const svgFavicon = path.join(distDir, 'favicon.svg');
        if (fs.existsSync(svgFavicon)) {
          reply.header('Cache-Control', 'public, max-age=3600');
          reply.type('image/svg+xml');
          return reply.send(fs.createReadStream(svgFavicon));
        }
        return reply.status(204).send();
      }

      if (relPath.startsWith('assets/')) {
        return reply.status(404).send({
          message: `Asset ${decodedPath} not found`,
          error: 'Not Found',
          statusCode: 404,
        });
      }
    }

    const indexPath = path.join(distDir, 'index.html');
    reply.header('Cache-Control', 'no-cache');
    reply.type('text/html; charset=utf-8');
    return reply.send(fs.createReadStream(indexPath));
  });
};

