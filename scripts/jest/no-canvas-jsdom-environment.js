const Module = require('module');

const originalLoad = Module._load;

Module._load = function loadWithoutNativeCanvas(request, parent, isMain) {
  if (request === 'canvas') {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { TestEnvironment } = require('jest-environment-jsdom');

Module._load = originalLoad;

module.exports = TestEnvironment;
