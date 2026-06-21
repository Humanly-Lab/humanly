#!/usr/bin/env node

import { main } from '../lib/installer.mjs';

main(process.argv.slice(2)).catch((error) => {
  console.error(`\ncreate-humanly failed: ${error.message}`);
  process.exit(1);
});
