const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const routes = require('./routes');
const { csrfGuard } = require('./middleware/auth');
const { apiLimiter, notFound, errorHandler } = require('./middleware/common');
const { ApiError } = require('./utils/helpers');

const app = express();
app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin(origin, cb) {
      return cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization'],
    maxAge: 600,
  })
);
app.use(compression());
if (env.NODE_ENV !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $ and . operators from user input (NoSQL injection)

// Never let browsers/proxies cache API responses (quiz data, results)
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/health', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', time: new Date() });
});

app.use('/api', apiLimiter, csrfGuard, routes);

// Database offline graceful fallback
app.use((err, req, res, next) => {
  if (
    err &&
    (err.name === 'MongooseError' ||
      err.name === 'MongoNetworkError' ||
      err.name === 'MongooseServerSelectionError' ||
      (err.message && err.message.includes('buffering timed out')))
  ) {
    console.warn('[AI Studio] Database offline — returning mock response for', req.method, req.path);
    if (req.method === 'GET') {
      return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
    }
    return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
  }
  next(err);
});

// Serve client static build for unified single-service deployment
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') return next();
  if (fs.existsSync(clientDistPath)) {
    return express.static(clientDistPath)(req, res, () => {
      const indexPath = path.join(clientDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      next();
    });
  }
  next();
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
