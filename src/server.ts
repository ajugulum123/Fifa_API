/**
 * server.ts - FIFA GraphQL API entry point
 *
 * Transport security layers (outermost to innermost):
 * 1. HTTP redirect server - catches plain-text requests, sends 301 to HTTPS
 * 2. HTTPS server - TLS 1.2+ with strong cipher suite
 * 3. Helmet middleware - HSTS, CSP, X-Frame-Options, etc.
 * 4. CORS middleware - only whitelisted origins accepted
 * 5. Rate limiter - 429 before GraphQL engine even sees the request
 * 6. Apollo Server - GraphQL depth limit (rejects oversized queries)
 */

import 'dotenv/config';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import promBundle from 'express-prom-bundle';
import client from 'prom-client';
import { ApolloServer } from '@apollo/server';
// expressMiddleware types conflict with the project's @types/express version;
// casting via unknown sidesteps the duplicate declaration without affecting runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { expressMiddleware } = require('@apollo/server/express4') as { expressMiddleware: any };
import { ApolloServerPluginLandingPageDisabled }
  from '@apollo/server/plugin/disabled';
import depthLimit from 'graphql-depth-limit';

import { resolvers } from './resolvers/index';
import { loadPlayers } from './data/loadPlayers';
import { verifyAccessToken, extractBearerToken } from './auth/jwt';
import { findUserById, seedAdminUser, type PublicUser } from './auth/userStore';

//
// 1. Configuration (all values come from environment variables)
//

const IS_PROD = process.env.NODE_ENV === 'production';

// When DISABLE_INLINE_TLS=true the app listens on plain HTTP on PORT (default 4000) and
// skips loading TLS certs. Use this when running behind an Ingress / load balancer that
// terminates TLS upstream (Kubernetes deployments). The local dev story (npm run dev)
// keeps in-app TLS so https://localhost:4443 still works.
const DISABLE_INLINE_TLS = process.env.DISABLE_INLINE_TLS === 'true';
const PORT = parseInt(process.env.PORT ?? '4000', 10);

const HTTPS_PORT = parseInt(process.env.HTTPS_PORT ?? '4443', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? '4080', 10);
const TLS_KEY_PATH = process.env.TLS_KEY_PATH ?? './certs/server.key';
const TLS_CERT_PATH = process.env.TLS_CERT_PATH ?? './certs/server.crt';
const TLS_MIN_VERSION = (process.env.TLS_MIN_VERSION ?? 'TLSv1.2') as 'TLSv1.2' | 'TLSv1.3';
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'https://localhost:4443').split(',');
const RATE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const RATE_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10);
const MAX_DEPTH = parseInt(process.env.GRAPHQL_MAX_DEPTH ?? '6', 10);
const DISABLE_INTROSPECTION = process.env.DISABLE_INTROSPECTION === 'true';
const CSV_PATH = process.env.CSV_PATH ?? './dataset/player_stats.csv';

//
// 2. TLS options
// - Minimum protocol: TLSv1.2 (TLSv1 and TLSv1.1 are disabled by default
// in Node 22 but we enforce it explicitly)
// - Cipher suite: forward-secret AEAD ciphers only; weak ciphers excluded
// - honorCipherOrder: server cipher preference beats client preference
//

function loadTlsOptions(): https.ServerOptions {
  const keyPath = path.resolve(TLS_KEY_PATH);
  const certPath = path.resolve(TLS_CERT_PATH);

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error(
      '\nTLS certificate files not found.\n' +
      `  Key  : ${keyPath}\n` +
      `  Cert : ${certPath}\n` +
      'Run `npm run gen:certs` to generate development certificates.\n'
    );
    process.exit(1);
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),

    // Reject anything below TLS 1.2
    minVersion: TLS_MIN_VERSION,

    // Forward-secret, AEAD-only cipher suite.
    // Priority: ECDHE+AES-256-GCM > ECDHE+ChaCha20 > DHE fallbacks.
    // Explicitly exclude: NULL, EXPORT, DES, RC4, MD5, anon, low-bit.
    ciphers: [
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'DHE-RSA-AES256-GCM-SHA384',
      'DHE-RSA-AES128-GCM-SHA256',
      '!aNULL',
      '!eNULL',
      '!EXPORT',
      '!DES',
      '!RC4',
      '!MD5',
      '!PSK',
      '!SRP',
      '!CAMELLIA',
      '!3DES',
    ].join(':'),

    // Server selects cipher, not client - prevents downgrade attacks
    honorCipherOrder: true,
  };
}

//
// 3. Express middleware stack
//

function buildExpressApp(): express.Application {
  const app = express();
  app.set('trust proxy', 1); // required when behind a reverse proxy

  // 3.0. Prometheus metrics. /metrics is wired before any auth or rate limiting
  // so a scrape never gets a 429. Register node default metrics (event loop lag,
  // GC, heap, fd count) plus per-request histograms with route+status labels.
  client.collectDefaultMetrics({ prefix: 'fifa_api_' });
  app.use(
    promBundle({
      includeMethod: true,
      includePath: true,
      includeStatusCode: true,
      // Histogram buckets in seconds. Tuned for an in-memory GraphQL API.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      promClient: { collectDefaultMetrics: {} },
      // Drop the /metrics endpoint from its own histogram so scrapes are not
      // counted as user traffic.
      autoregister: true,
      metricsPath: '/metrics',
      // Strip the high-cardinality query-string portion of paths.
      normalizePath: [
        ['^/graphql/.*', '/graphql'],
      ],
    })
  );

  // 3a. Helmet - sets security-critical HTTP response headers
  app.use(
    helmet({
      // HTTP Strict Transport Security: force HTTPS for 1 year, include subdomains
      hsts: {
        maxAge: 31_536_000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
      // Prevent MIME sniffing
      noSniff: true,
      // Block clickjacking
      frameguard: { action: 'deny' },
      // Disable browser DNS prefetching for privacy
      dnsPrefetchControl: { allow: false },
      // Content Security Policy - restrict what the Apollo sandbox can load
      contentSecurityPolicy: IS_PROD
        ? undefined // use Helmet's strict production default
        : false, // relaxed in dev to allow Apollo sandbox
    })
  );

  // 3b. CORS - only allow listed origins to send cross-origin requests
  app.use(
    cors({
      origin: CORS_ORIGINS,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight'],
      credentials: true,
    })
  );

  // 3c. Rate limiter - enforced before GraphQL engine, returns 429 with schema
  // error payload format so the client can read retryAfterSeconds
  const limiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    max: RATE_MAX,
    standardHeaders: true, // RateLimit-* headers (RFC 9110)
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfter = Math.ceil(RATE_WINDOW_MS / 1000);
      res.status(429).json({
        data: null,
        errors: [
          {
            message: `Rate limit exceeded. Try again in ${retryAfter}s.`,
            extensions: {
              code: 'TOO_MANY_REQUESTS',
              category: 'CLIENT_ERROR',
              httpStatus: 429,
              retryAfterSeconds: retryAfter,
            },
          },
        ],
      });
    },
  });
  app.use('/graphql', limiter);

  return app;
}

//
// 4. Apollo Server
//

async function buildApolloServer(playerStore: ReturnType<typeof loadPlayers>) {
  const typeDefs = fs.readFileSync(
    path.resolve(__dirname, '../graphql/schema.graphql'),
    'utf8'
  );

  const server = new ApolloServer({
    typeDefs,
    resolvers,

    // Reject queries deeper than MAX_DEPTH before any resolver fires
    validationRules: [depthLimit(MAX_DEPTH)],

    // Disable introspection in production to hide schema structure from attackers
    introspection: !DISABLE_INTROSPECTION,

    plugins: IS_PROD
      ? [ApolloServerPluginLandingPageDisabled()] // no sandbox in production
      : [],

    // Mask internal errors in production - never expose stack traces to clients
    formatError: (formattedError, error) => {
      if (IS_PROD && formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        return {
          message: 'An unexpected error occurred. Please try again later.',
          extensions: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
        };
      }
      return formattedError;
    },
  });

  await server.start();

  return { server, typeDefs, playerStore };
}

//
// 5. HTTP -> HTTPS redirect server
// Plain HTTP requests get a 301 permanent redirect to the HTTPS equivalent.
// This catches any client that accidentally uses http://.
//

function startRedirectServer(): void {
  http.createServer((req, res) => {
    const host = req.headers.host?.replace(/:\d+$/, '') ?? 'localhost';
    const target = `https://${host}:${HTTPS_PORT}${req.url ?? '/'}`;

    res.writeHead(301, {
      Location: target,
      'Strict-Transport-Security': `max-age=31536000; includeSubDomains; preload`,
    });
    res.end();
  }).listen(HTTP_PORT, () => {
    console.log(`HTTP -> HTTPS redirect listening on http://localhost:${HTTP_PORT}`);
  });
}

//
// 6. Bootstrap - wire everything together and start
//

async function bootstrap(): Promise<void> {
  // Seed admin user before accepting requests
  await seedAdminUser();

  // Load CSV data into memory
  console.log('Loading player data...');
  const playerStore = loadPlayers(path.resolve(CSV_PATH));
  console.log(`Loaded ${playerStore.size} players.`);

  // Build Express app (middleware only - no routes yet)
  const app = buildExpressApp();

  // Build and start Apollo Server
  const { server } = await buildApolloServer(playerStore);

  // Mount GraphQL endpoint with Apollo's Express middleware
  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }: { req: express.Request }) => {
        // Extract and verify the Bearer token on every request.
        // An invalid or missing token yields currentUser: null - resolvers
        // decide whether that is acceptable for their operation.
        let currentUser = null;
        const raw = extractBearerToken(req.headers.authorization);
        if (raw) {
          const result = verifyAccessToken(raw);
          if (result.ok) {
            currentUser = findUserById(result.payload.sub);
          }
        }
        return {
          playerStore,
          requestId: (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
          currentUser,
        };
      },
    })
  );

  // Health check. Returns 200 so a Kubernetes readiness/liveness probe or external load
  // balancer can verify the process is up. The "tls" field reflects whether the app is
  // serving TLS itself, not whether the request reached over HTTPS (TLS may terminate upstream).
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      tls: !DISABLE_INLINE_TLS,
      timestamp: new Date().toISOString(),
    });
  });

  // 404 for everything else
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found. GraphQL endpoint is /graphql' });
  });

  // Two transport modes:
  //
  // 1. DISABLE_INLINE_TLS=true (Kubernetes deployment, TLS at Ingress):
  //    listen on PORT (default 4000) over plain HTTP. No HTTP redirect server.
  //    The Ingress handles HTTPS and the http->https redirect.
  //
  // 2. Default (local dev): listen on HTTPS_PORT with in-app TLS plus an HTTP
  //    redirect server on HTTP_PORT. Same behavior the project shipped with.

  let listener: http.Server | https.Server;

  if (DISABLE_INLINE_TLS) {
    listener = http.createServer(app);
    listener.listen(PORT, () => {
      console.log(`\nGraphQL API ready`);
      console.log(`  HTTP    : http://0.0.0.0:${PORT}/graphql (TLS terminates upstream)`);
      console.log(`  Depth   : queries > ${MAX_DEPTH} levels rejected`);
      console.log(`  Rate    : ${RATE_MAX} req / ${RATE_WINDOW_MS / 1000}s per IP`);
    });
  } else {
    const tlsOptions = loadTlsOptions();
    listener = https.createServer(tlsOptions, app);
    listener.listen(HTTPS_PORT, () => {
      console.log(`\nGraphQL API ready`);
      console.log(`  HTTPS   : https://localhost:${HTTPS_PORT}/graphql`);
      console.log(`  TLS     : ${TLS_MIN_VERSION}+ enforced`);
      console.log(`  Depth   : queries > ${MAX_DEPTH} levels rejected`);
      console.log(`  Rate    : ${RATE_MAX} req / ${RATE_WINDOW_MS / 1000}s per IP`);
      if (!IS_PROD) console.log(`  Sandbox : https://localhost:${HTTPS_PORT}/graphql\n`);
    });

    startRedirectServer();
  }

  // Graceful shutdown. SIGTERM is what Kubernetes sends on pod stop. We give Apollo
  // and the HTTP listener a chance to drain in-flight requests.
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully.`);
    await server.stop();
    listener.close(() => {
      console.log('Listener closed.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Shutdown timeout, forcing exit.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
