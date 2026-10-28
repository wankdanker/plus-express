import { describe, it, expect } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { plus, z, ApiOptions, ExpressPlusApplication } from './index';

type ValidationError = Error & { status?: number; errors?: unknown };

/**
 * Creates an enhanced app that parses JSON bodies
 */
function createApp(opts?: ApiOptions) {
  const result = plus(express(), opts);
  result.app.use(express.json());
  return result;
}

/**
 * Adds an error handler that responds with the validation error's status, message and issues
 */
function handleErrors(app: ExpressPlusApplication) {
  app.use((err: ValidationError, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.status ?? 500).json({ message: err.message, errors: err.errors });
  });
}

describe('request validation', () => {
  describe('body', () => {
    it('applies schema transforms and defaults to req.parsed.body and req.body', async () => {
      const { app } = createApp();
      app.post({
        path: '/users',
        body: z.object({
          name: z.string().trim(),
          role: z.enum(['admin', 'user']).default('user'),
        }),
      }, (req, res) => {
        res.json({ parsed: req.parsed.body, body: req.body });
      });

      const response = await request(app).post('/users').send({ name: '  Ada  ' });

      expect(response.status).toBe(200);
      expect(response.body.parsed).toEqual({ name: 'Ada', role: 'user' });
      expect(response.body.body).toEqual({ name: 'Ada', role: 'user' });
    });

    it('strips keys not in the schema', async () => {
      const { app } = createApp();
      app.post({ path: '/users', body: z.object({ name: z.string() }) }, (req, res) => {
        res.json(req.parsed.body);
      });

      const response = await request(app).post('/users').send({ name: 'Ada', isAdmin: true });

      expect(response.body).toEqual({ name: 'Ada' });
    });

    it('accepts non-object body schemas', async () => {
      const { app } = createApp();
      app.post({ path: '/tags', body: z.array(z.string()).min(1) }, (req, res) => {
        res.json({ count: req.parsed.body.length });
      });

      const response = await request(app).post('/tags').send(['a', 'b']);

      expect(response.body).toEqual({ count: 2 });
    });

    it('rejects an invalid body with the Zod issues and skips the handler', async () => {
      const { app } = createApp();
      let handlerCalled = false;
      app.post({
        path: '/users',
        body: z.object({ name: z.string(), email: z.email() }),
      }, (req, res) => {
        handlerCalled = true;
        res.json({});
      });
      handleErrors(app);

      const response = await request(app).post('/users').send({ name: 'Ada', email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual([
        expect.objectContaining({ code: 'invalid_format', path: ['email'] }),
      ]);
      expect(handlerCalled).toBe(false);
    });

    it('rejects a missing body when the schema requires one', async () => {
      const { app } = createApp();
      app.post({ path: '/users', body: z.object({ name: z.string() }) }, (req, res) => {
        res.json({});
      });
      handleErrors(app);

      const response = await request(app).post('/users');

      expect(response.status).toBe(400);
    });

    it('attaches the ZodError as the cause', async () => {
      const { app } = createApp();
      let cause: unknown;
      app.post({ path: '/users', body: z.object({ name: z.string() }) }, (req, res) => {
        res.json({});
      });
      app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        cause = err.cause;
        res.status(400).end();
      });

      await request(app).post('/users').send({});

      expect(cause).toBeInstanceOf(z.ZodError);
    });
  });

  describe('params', () => {
    it('coerces params onto req.parsed.params and req.params', async () => {
      const { app } = createApp();
      app.get({
        path: '/users/:id',
        params: z.object({ id: z.coerce.number().int() }),
      }, (req, res) => {
        res.json({ parsed: req.parsed.params.id, raw: req.params.id });
      });

      const response = await request(app).get('/users/42');

      expect(response.body).toEqual({ parsed: 42, raw: 42 });
    });

    it('rejects invalid params', async () => {
      const { app } = createApp();
      app.get({
        path: '/users/:id',
        params: z.object({ id: z.uuid() }),
      }, (req, res) => {
        res.json({});
      });
      handleErrors(app);

      const response = await request(app).get('/users/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([expect.objectContaining({ path: ['id'] })]);
    });
  });

  describe('query', () => {
    it('coerces and defaults query values on req.parsed.query', async () => {
      const { app } = createApp();
      app.get({
        path: '/users',
        query: z.object({
          limit: z.coerce.number().default(10),
          offset: z.coerce.number().default(0),
        }),
      }, (req, res) => {
        res.json(req.parsed.query);
      });

      const response = await request(app).get('/users?limit=5');

      expect(response.body).toEqual({ limit: 5, offset: 0 });
    });

    it('writes validated values back onto req.query and keeps other keys', async () => {
      const { app } = createApp();
      app.get({
        path: '/users',
        query: z.object({ limit: z.coerce.number() }),
      }, (req, res) => {
        res.json(req.query);
      });

      const response = await request(app).get('/users?limit=5&extra=1');

      expect(response.body).toEqual({ limit: 5, extra: '1' });
    });

    it('rejects invalid query values', async () => {
      const { app } = createApp();
      app.get({
        path: '/users',
        query: z.object({ sort: z.enum(['asc', 'desc']) }),
      }, (req, res) => {
        res.json({});
      });
      handleErrors(app);

      const response = await request(app).get('/users?sort=sideways');

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([expect.objectContaining({ path: ['sort'] })]);
    });
  });

  describe('headers', () => {
    it('coerces headers onto req.parsed.headers and req.headers', async () => {
      const { app } = createApp();
      app.get({
        path: '/items',
        headers: z.object({ 'x-page-size': z.coerce.number() }),
      }, (req, res) => {
        res.json({ parsed: req.parsed.headers['x-page-size'], raw: req.headers['x-page-size'] });
      });

      const response = await request(app).get('/items').set('X-Page-Size', '25');

      expect(response.body).toEqual({ parsed: 25, raw: 25 });
    });

    it('keeps headers that are not in the schema on req.headers', async () => {
      const { app } = createApp();
      app.get({
        path: '/items',
        headers: z.object({ 'x-page-size': z.coerce.number() }),
      }, (req, res) => {
        res.json({ other: req.headers['x-other'] });
      });

      const response = await request(app).get('/items').set('X-Page-Size', '25').set('X-Other', 'kept');

      expect(response.body).toEqual({ other: 'kept' });
    });

    it('rejects invalid header values', async () => {
      const { app } = createApp();
      app.get({
        path: '/items',
        headers: z.object({ 'x-page-size': z.coerce.number().max(100) }),
      }, (req, res) => {
        res.json({});
      });
      handleErrors(app);

      const response = await request(app).get('/items').set('X-Page-Size', '500');

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([expect.objectContaining({ path: ['x-page-size'] })]);
    });
  });

  describe('routes without schemas', () => {
    it('exposes the raw request values on req.parsed', async () => {
      const { app } = createApp();
      app.post({ path: '/echo/:id' }, (req, res) => {
        res.json({ body: req.parsed.body, params: req.parsed.params });
      });

      const response = await request(app).post('/echo/7').send({ a: 1 });

      expect(response.body).toEqual({ body: { a: 1 }, params: { id: '7' } });
    });
  });

  describe('default schemas', () => {
    it('applies a default query schema to routes defined after it is set', async () => {
      const { app, registry } = createApp();
      app.get({ path: '/before' }, (req, res) => {
        res.json(req.parsed.query);
      });
      registry.setDefaultQuerySchema(z.object({ format: z.enum(['json', 'xml']).default('json') }));
      app.get({ path: '/after' }, (req, res) => {
        res.json(req.parsed.query);
      });

      const before = await request(app).get('/before');
      const after = await request(app).get('/after');

      expect(before.body).toEqual({});
      expect(after.body).toEqual({ format: 'json' });
    });

    it('lets a route query schema override a default with the same key', async () => {
      const { app, registry } = createApp();
      registry.setDefaultQuerySchema(z.object({ limit: z.coerce.number().default(10) }));
      app.get({
        path: '/users',
        query: z.object({ limit: z.coerce.number().default(50) }),
      }, (req, res) => {
        res.json(req.parsed.query);
      });

      const response = await request(app).get('/users');

      expect(response.body).toEqual({ limit: 50 });
    });

    it('accepts a default header schema through plus() options', async () => {
      const { app } = createApp({
        defaultHeaderSchema: z.object({ 'x-tenant': z.string().default('public') }),
      });
      app.get({ path: '/items' }, (req, res) => {
        res.json({ tenant: (req.parsed.headers as { 'x-tenant': string })['x-tenant'] });
      });

      const response = await request(app).get('/items');

      expect(response.body).toEqual({ tenant: 'public' });
    });
  });
});
