const express = require('express');

const app = express();
const port = 3000;
const instanceId = require('os').hostname();

let requestCount = 0;

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hostname: instanceId,
    requestCount: ++requestCount
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    instance: instanceId,
    requestNumber: ++requestCount,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/load', (req, res) => {
  const startTime = Date.now();
  
  // 軽量なCPU負荷
  while (Date.now() - startTime < 2000) {
    Math.random() * Math.random();
  }
  
  res.json({
    message: 'CPU load completed',
    instance: instanceId,
    duration: '2 seconds',
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}, instance: ${instanceId}`);
});
