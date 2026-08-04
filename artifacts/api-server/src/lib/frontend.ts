import path from 'path';
import fs from 'fs';
import express, { type Express } from 'express';
import { logger } from './logger.js';

export function attachFrontend(app: Express): void {
  const distDir = process.env['FRONTEND_DIST_DIR'] || 'public';
  const staticDir = path.isAbsolute(distDir) ? distDir : path.join(process.cwd(), distDir);

  if (!fs.existsSync(staticDir)) {
    logger.warn({ staticDir }, 'Frontend dist directory not found; static assets will not be served');
    return;
  }

  // Check for index.html to confirm frontend is actually built
  const indexPath = path.join(staticDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    logger.warn({ staticDir, indexPath }, 'Frontend index.html not found; static serving disabled');
    return;
  }

  // Serve static assets with long cache headers for immutables
  app.use(express.static(staticDir, { maxAge: '1y', index: false }));

  // SPA fallback: serve index.html for unknown GET routes (allow API prefix to pass)
  // Express 5: use regex pattern instead of wildcard "*"
  app.get(/^(?!\/api|\/socket\.io).*$/, (req, res) => {
    res.sendFile(indexPath);
  });
}
