/**
 * Victor Service Server - Zo Native Integration
 * 
 * Exposes Victor kernel via HTTP API for integration with Zo ecosystem.
 * Deterministic processing - no LLM for core functions.
 */

import { Hono } from 'hono';
import { victorKernel } from './victor-kernel';

const app = new Hono();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 9500;

// Health check
app.get('/health', (c) => {
  return c.json({
    service: 'victor-kernel',
    status: 'healthy',
    mode: 'deterministic',
    llm: 'disabled',
    timestamp: new Date().toISOString()
  });
});

// Victor API endpoints
app.post('/api/victor/process', async (c) => {
  try {
    const request = await c.req.json();
    
    // Validate request structure
    if (!request.id || !request.userId || !request.action) {
      return c.json({ error: 'Invalid request - missing required fields' }, 400);
    }
    
    // Process through Victor kernel
    const result = await victorKernel.process(request);
    
    return c.json(result, result.allowed ? 200 : 403);
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, 500);
  }
});

// Task management endpoints (deterministic)
app.post('/api/tasks', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'anonymous',
    action: 'task.create',
    params: await c.req.json(),
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

app.get('/api/tasks', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'anonymous',
    action: 'task.list',
    params: {},
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

// Governance endpoints
app.get('/api/victor/mode', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'system',
    action: 'victor.mode',
    params: {},
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

app.post('/api/victor/stance', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'system',
    action: 'victor.stance',
    params: await c.req.json(),
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

// Audit log
app.get('/api/audit', async (c) => {
  const request = {
    id: crypto.randomUUID(),
    userId: c.req.header('x-user-id') || 'system',
    action: 'audit.log',
    params: {},
    timestamp: new Date().toISOString()
  };
  
  const result = await victorKernel.process(request);
  return c.json(result);
});

// Start server
console.log('Victor Kernel Service starting...');
console.log(`Port: ${PORT}`);
console.log('Mode: Deterministic (no LLM)');

Bun.serve({
  fetch: app.fetch,
  port: PORT
});
