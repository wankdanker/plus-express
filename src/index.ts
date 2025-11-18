import { Application, Router } from 'express';
import { expressPlus } from './express-plus';
import { routerPlus } from './router-plus';
import { createRegistry } from './registry';
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Re-export types
export * from './types';

// Ensure Zod is extended with OpenAPI
extendZodWithOpenApi(z);

/**
 * ExpressPlus - Enhanced Express with validation and OpenAPI documentation
 */
export {
  expressPlus,
  routerPlus,
  createRegistry,
  z
};

/**
 * Create an enhanced Express application
 * 
 * @param app Optional Express application (creates one if not provided)
 * @param options Configuration options
 */
export function createExpressPlus(app?: Application, options = {}) {
  // If no app is provided, try to require express and create one
  if (!app) {
    try {
      const express = require('express');
      app = express();
    } catch (error) {
      throw new Error(
        'Express is not installed. Please install express or provide an express application instance.'
      );
    }
  }
  
  return expressPlus(app as Application, options);
}

/**
 * Create an enhanced Express router
 * 
 * @param router Optional Express router (creates one if not provided)
 * @param options Configuration options
 */
export function createRouterPlus(router?: Router, options = {}) {
  return routerPlus(router, options);
}

// Default export as a factory function
export default createExpressPlus;