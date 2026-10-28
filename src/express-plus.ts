import { Application } from 'express';
import { createRegistry } from './registry';
import {
  ApiOptions,
  ExpressPlusApplication,
  ExpressPlusReturn,
  MountInfo,
} from './types';
import { enhanceHttpMethods, recordRouterPlusMount } from './utils';

/**
 * Enhances an Express application with typed route handling and OpenAPI documentation
 * 
 * @param app Express application instance
 * @param opts API configuration options (optional)
 * @returns Enhanced Express application and registry
 */
export const expressPlus = (app: Application, opts: ApiOptions = {}): ExpressPlusReturn => {
  // Create an instance-specific mount registry (no global state)
  const mountRegistry: MountInfo[] = [];

  // Create the registry; its documents include the routers recorded in mountRegistry
  const registry = createRegistry(opts, mountRegistry);

  // Define the HTTP methods to enhance
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

  // Enhance the app with our augmented methods
  enhanceHttpMethods(app, methods, registry.createEndpoint);

  // Keep a reference to the original use method
  const originalUse = app.use as unknown as (...args: unknown[]) => Application;

  // Override the use method to track router mounting
  app.use = function(this: Application, ...args: unknown[]): Application {
    recordRouterPlusMount(args, mountRegistry);

    // Call the original use method
    return originalUse.apply(this, args);
  } as Application['use'];

  // Return enhanced app and registry
  return {
    app: app as unknown as ExpressPlusApplication,
    registry
  };
};