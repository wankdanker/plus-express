/**
 * Type-level tests. The expectTypeOf assertions are checked by `npm run type-check`
 * (tsc includes test files); at runtime they only build the apps.
 */
import { describe, it, expectTypeOf } from 'vitest';
import { RequestListener } from 'http';
import express, { NextFunction, Request, Response, Router } from 'express';
import { plus, z, ExpressPlusReturn, RouterPlusReturn } from './index';

describe('type inference', () => {
  it('infers req.parsed types from the route schemas', () => {
    const { app } = plus(express());

    app.post({
      path: '/users/:id',
      body: z.object({ name: z.string(), tags: z.array(z.string()).optional() }),
      params: z.object({ id: z.coerce.number() }),
      query: z.object({ dryRun: z.coerce.boolean().default(false) }),
      headers: z.object({ 'x-request-id': z.string() }),
    }, (req, res) => {
      expectTypeOf(req.parsed.body).toEqualTypeOf<{ name: string; tags?: string[] | undefined }>();
      expectTypeOf(req.parsed.params).toEqualTypeOf<{ id: number }>();
      expectTypeOf(req.parsed.query).toEqualTypeOf<{ dryRun: boolean }>();
      expectTypeOf(req.parsed.headers).toEqualTypeOf<{ 'x-request-id': string }>();
      res.end();
    });
  });

  it('infers req.parsed types with the path + options form', () => {
    const { app } = plus(express());

    app.get('/items/:id', { params: z.object({ id: z.string() }) }, (req, res) => {
      expectTypeOf(req.parsed.params).toEqualTypeOf<{ id: string }>();
      res.end();
    });
  });

  it('types req.parsed parts without a schema as unknown', () => {
    const { app } = plus(express());

    app.get({ path: '/items' }, (req, res) => {
      expectTypeOf(req.parsed.body).toBeUnknown();
      expectTypeOf(req.parsed.query).toBeUnknown();
      res.end();
    });
  });

  it('infers types on enhanced routers', () => {
    const { router } = plus();

    router.put({ path: '/x', body: z.object({ done: z.boolean() }) }, (req, res) => {
      expectTypeOf(req.parsed.body).toEqualTypeOf<{ done: boolean }>();
      res.end();
    });
  });

  it('accepts any kind of object schema for params, query and headers', () => {
    const { app } = plus(express());

    app.get({
      path: '/strict/:id',
      params: z.strictObject({ id: z.string() }),
      query: z.looseObject({ q: z.string() }),
      headers: z.object({ 'x-a': z.string() }).catchall(z.string()),
    }, (req, res) => {
      expectTypeOf(req.parsed.params).toEqualTypeOf<{ id: string }>();
      res.end();
    });

    // @ts-expect-error params must be an object schema
    app.get({ path: '/invalid', params: z.string() }, (req, res) => {
      res.end();
    });
  });

  it('returns the app result for apps and the router result for routers', () => {
    expectTypeOf(plus(express())).toEqualTypeOf<ExpressPlusReturn>();
    expectTypeOf(plus()).toEqualTypeOf<RouterPlusReturn>();
    expectTypeOf(plus(Router())).toEqualTypeOf<RouterPlusReturn>();
  });

  it('keeps enhanced apps and routers usable as Express handlers', () => {
    const { app } = plus(express());
    const { router } = plus();

    // Enhanced apps work as Node request listeners (http.createServer, supertest)
    const listener: RequestListener = app;
    expectTypeOf(listener).toEqualTypeOf<RequestListener>();

    // Enhanced routers can be mounted on plain Express apps and on enhanced apps
    express().use('/api', router);
    app.use('/api', router);
    app.use(router);
  });

  it('accepts error-handling middleware in use()', () => {
    const { app } = plus(express());
    const { router } = plus();

    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      res.status(500).send(err.message);
    });
    router.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      res.status(500).send(err.message);
    });
  });
});
