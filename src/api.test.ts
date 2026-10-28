import { describe, it, expect } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';
import createDefault, {
  plus,
  plusRouter,
  routerPlus,
  expressPlus,
  createExpressPlus,
  createRouterPlus,
  createRegistry,
  z,
} from './index';

describe('public API', () => {
  it('plus(app) enhances and returns the given app', () => {
    const app = express();
    const result = plus(app);

    expect(result.app).toBe(app);
    expect(result.registry).toBeDefined();
  });

  it('plus() creates a new enhanced router', () => {
    const result = plus();

    expect(typeof result.router).toBe('function');
    expect(result.router._isRouterPlus).toBe(true);
  });

  it('plus(router) enhances and returns the given router', () => {
    const router = Router();
    const result = plus(router);

    expect(result.router).toBe(router);
  });

  it('createExpressPlus() creates an app when none is given', async () => {
    const { app } = createExpressPlus();
    app.get({ path: '/ping' }, (req, res) => {
      res.send('pong');
    });

    expect((await request(app).get('/ping')).text).toBe('pong');
  });

  it('createExpressPlus(app) enhances the given app', () => {
    const app = express();

    expect(createExpressPlus(app).app).toBe(app);
  });

  it('createRouterPlus() creates a router, or enhances the given one', () => {
    const router = Router();

    expect(createRouterPlus().router._isRouterPlus).toBe(true);
    expect(createRouterPlus(router).router).toBe(router);
  });

  it('exports createExpressPlus as the default export', () => {
    expect(createDefault).toBe(createExpressPlus);
  });

  it('exports plusRouter as an alias of routerPlus', () => {
    expect(plusRouter).toBe(routerPlus);
  });

  it('exposes the lower-level building blocks', () => {
    expect(typeof expressPlus).toBe('function');
    expect(typeof createRegistry().generateOpenAPIDocument).toBe('function');
  });

  it('exports a z that is extended with .openapi()', () => {
    expect(typeof z.string().openapi).toBe('function');
  });

  it('returns the registry from each builder method for chaining', () => {
    const { registry } = plus(express());

    const chained = registry
      .setInfo({ title: 'API', version: '1.0.0' })
      .addServer({ url: 'http://localhost' })
      .setDefaultQuerySchema(z.object({}))
      .setDefaultHeaderSchema(z.object({}))
      .setDefaultResponses({})
      .registerSecurityScheme('bearer', { type: 'http', scheme: 'bearer' });

    expect(chained).toBe(registry);
  });
});
